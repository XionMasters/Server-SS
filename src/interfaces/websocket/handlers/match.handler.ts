import Match from '../../../infrastructure/database/models/Match';
import { GameStateBuilder } from '../../../app/matches/actions/GameStateBuilder';
import { SelectionService } from '../../../app/matches/actions/SelectionService';
import { StartMatchService } from '../../../app/matches/lifecycle/startMatch.service';
import { matchesCoordinator } from '../../../app/matches/coordinators/matchesCoordinator';
import { AuthenticatedWebSocket } from '../../../infrastructure/websocket/middleware/auth.middleware';
import { WebSocketPresenceService } from '../../../infrastructure/websocket/presence.service';
import { RouterEventHandler } from '../../../infrastructure/websocket/websocket-router';
import { broadcastAdminStats } from './admin.handler';

type MatchAction = Record<string, any>;
type ActionDispatcher = (ws: AuthenticatedWebSocket, action: MatchAction) => Promise<void>;

export function createMatchHandlers(
  presenceService: WebSocketPresenceService,
  dispatchAction: ActionDispatcher
) {
  const refreshAdminStats = () => broadcastAdminStats(presenceService.getPrimarySocketsMap());

  // Cada jugador recibe su propia perspectiva: la mano del rival va oculta
  const broadcastMatchUpdate = async (matchId: string, lastAction: Record<string, any> | null = null): Promise<void> => {
    try {
      const events = await matchesCoordinator.buildMatchUpdateEvents(matchId, lastAction);
      if (events.length === 0) {
        console.error('❌ Error construyendo estado para broadcast:', matchId);
        return;
      }

      for (const evt of events) {
        presenceService.sendToUsers(evt.recipients?.userIds ?? [], evt.type, evt.payload);
      }
    } catch (error) {
      console.error('Error broadcasting match update:', error);
    }
  };

  const handleSearchMatch = async (ws: AuthenticatedWebSocket) => {
    try {
      const userId = ws.userId!;
      console.log(`🔍 ${ws.username} busca partida...`);

      const result = await matchesCoordinator.findMatchOrCreate(
        userId,
        presenceService.getPrimarySocketsMap(),
        presenceService.getSocketSetsMap()
      );

      if (!result.success) {
        return presenceService.sendToSocket(ws, 'error', {
          code: 'SEARCH_ERROR',
          message: result.error || 'Error al buscar partida'
        });
      }

      if (result.status === 'match_found') {
        console.log(`✅ Match encontrado: ${result.match_id}`);

        const matchData = result.data;
        const player1Id = matchData.player1.id as string;
        const player2Id = matchData.player2.id as string;
        const matchRecord = await Match.findByPk(result.match_id);

        if (matchRecord) {
          const [gs1, gs2] = await Promise.all([
            GameStateBuilder.buildFromMatch(matchRecord, { perspectivePlayer: 1 }),
            GameStateBuilder.buildFromMatch(matchRecord, { perspectivePlayer: 2 })
          ]);
          presenceService.broadcastToUsers([player1Id], 'match_found', { match_id: result.match_id, game_state: gs1 });
          presenceService.broadcastToUsers([player2Id], 'match_found', { match_id: result.match_id, game_state: gs2 });
        } else {
          presenceService.broadcastToUsers([player1Id, player2Id].filter(Boolean), 'match_found', matchData);
        }
      } else {
        console.log(`⏳ ${ws.username} esperando rival... (Match ID: ${result.match_id})`);
        presenceService.sendToSocket(ws, 'searching', {
          message: 'Buscando rival...',
          match_id: result.match_id
        });
      }

      await refreshAdminStats();
    } catch (error: any) {
      console.error('Error en search_match:', error);
      presenceService.sendToSocket(ws, 'error', {
        code: 'SEARCH_ERROR',
        message: 'Error al buscar partida'
      });
    }
  };

  const handleCancelSearch = async (ws: AuthenticatedWebSocket) => {
    try {
      const waitingMatch = await Match.findOne({
        where: { player1_id: ws.userId!, phase: 'waiting' }
      });

      if (waitingMatch) {
        await waitingMatch.destroy();
        console.log(`✅ ${ws.username} canceló la búsqueda exitosamente`);
        presenceService.sendToSocket(ws, 'search_cancelled', { success: true, message: 'Búsqueda cancelada' });
        await refreshAdminStats();
      } else {
        presenceService.sendToSocket(ws, 'search_cancelled', { success: false, message: 'No hay búsqueda activa' });
      }
    } catch (error) {
      console.error('Error cancelando búsqueda:', error);
      presenceService.sendToSocket(ws, 'error', {
        code: 'CANCEL_ERROR',
        message: 'Error al cancelar búsqueda'
      });
    }
  };

  const handleResolveSelection = async (ws: AuthenticatedWebSocket, data: any) => {
    try {
      const { match_id, selection_id, chosen_card_id, action_id } = data ?? {};

      if (!match_id || !selection_id || !chosen_card_id || !action_id) {
        presenceService.sendToSocket(ws, 'error', {
          code: 'MISSING_FIELDS',
          message: 'Se requieren match_id, selection_id, chosen_card_id y action_id'
        });
        return;
      }

      const result = await SelectionService.resolveSelection({
        match_id,
        user_id: ws.userId!,
        selection_id,
        chosen_card_id,
        action_id
      });

      if (!result.success) {
        presenceService.sendToSocket(ws, 'error', {
          code: result.code || 'SELECTION_ERROR',
          message: result.error || 'Error resolviendo selección'
        });
        return;
      }

      await broadcastMatchUpdate(match_id, { type: 'resolve_selection', selection_id, chosen_card_id });
    } catch (error: any) {
      console.error('Error en resolve_selection:', error);
      presenceService.sendToSocket(ws, 'error', {
        code: 'SELECTION_ERROR',
        message: 'Error resolviendo selección'
      });
    }
  };

  const handleRequestMatchState = async (ws: AuthenticatedWebSocket, data: any) => {
    try {
      const matchId = data?.match_id;

      if (!matchId) {
        presenceService.sendToSocket(ws, 'error', {
          code: 'MATCH_ID_REQUIRED',
          message: 'match_id es requerido'
        });
        return;
      }

      const result = await matchesCoordinator.getMatchState(matchId, ws.userId!);

      if (!result.success) {
        presenceService.sendToSocket(ws, 'error', {
          code: (result as any).code || 'MATCH_STATE_ERROR',
          message: result.error || 'Error obteniendo estado de partida'
        });
        return;
      }

      presenceService.sendToSocket(ws, 'match_state', result.data);
    } catch (error: any) {
      console.error('Error en request_match_state:', error);
      presenceService.sendToSocket(ws, 'error', {
        code: 'MATCH_STATE_ERROR',
        message: 'Error obteniendo estado de partida'
      });
    }
  };

  const handleRequestTestMatch = async (ws: AuthenticatedWebSocket) => {
    try {
      console.log(`🎭 ${ws.username} solicita partida TEST`);
      const result = await StartMatchService.createNewMatch(ws.userId!, ws.userId!, 'TEST');
      presenceService.sendToSocket(ws, 'match_found', result);
    } catch (error: any) {
      console.error('❌ Error en handleRequestTestMatch:', error);

      let errorMessage = 'Error creando partida TEST';
      let errorCode = 'TEST_MATCH_ERROR';
      const message: string = error.message || '';

      if (message.includes('mazo activo')) {
        errorCode = 'NO_ACTIVE_DECK';
        errorMessage = message;
      } else if (message.includes('activa en curso') || message.includes('partida activa') || message.includes('ALREADY_IN_MATCH')) {
        errorCode = 'ALREADY_IN_MATCH';
        errorMessage = message;
      } else if (message.includes('esperando')) {
        errorCode = 'RATE_LIMIT';
        errorMessage = message;
      }

      presenceService.sendToSocket(ws, 'match_error', { code: errorCode, message: errorMessage, error: message });
    }
  };

  const handleResumeTestMatch = async (ws: AuthenticatedWebSocket) => {
    try {
      console.log(`♻️ ${ws.username} solicita reanudar partida TEST`);
      const result = await StartMatchService.resumeTestMatch(ws.userId!);
      presenceService.sendToSocket(ws, 'match_found', result);
    } catch (error: any) {
      console.error('❌ Error en handleResumeTestMatch:', error);
      presenceService.sendToSocket(ws, 'match_error', {
        code: 'RESUME_ERROR',
        message: error.message || 'Error reanudando partida TEST',
        error: error.message
      });
    }
  };

  const handleAbandonTestMatch = async (ws: AuthenticatedWebSocket, data: { match_id: string }) => {
    try {
      console.log(`🗑️ ${ws.username} abandonando partida TEST: ${data?.match_id}`);
      const result = await matchesCoordinator.abandonMatch(data?.match_id, ws.userId!);

      if (!result.success) {
        throw new Error(result.error || 'Error abandonando partida');
      }

      await handleRequestTestMatch(ws);
    } catch (error: any) {
      console.error('❌ Error en handleAbandonTestMatch:', error);
      presenceService.sendToSocket(ws, 'match_error', {
        code: 'ABANDON_ERROR',
        message: error.message || 'Error abandonando partida TEST',
        error: error.message
      });
    }
  };

  const action = (type: string, fields: string[]): RouterEventHandler =>
    async (ws, data) => {
      const payload: MatchAction = { type, match_id: data.match_id, action_id: data.action_id };
      for (const field of fields) payload[field] = data[field];
      await dispatchAction(ws, payload);
    };

  const handlers: Record<string, RouterEventHandler> = {
    request_test_match: ws => handleRequestTestMatch(ws),
    resume_test_match: ws => handleResumeTestMatch(ws),
    abandon_test_match: (ws, data) => handleAbandonTestMatch(ws, data),
    search_match: ws => handleSearchMatch(ws),
    cancel_search: ws => handleCancelSearch(ws),
    resolve_selection: (ws, data) => handleResolveSelection(ws, data),
    request_match_state: (ws, data) => handleRequestMatchState(ws, data),
    play_card: action('PLAY_CARD', ['card_id', 'zone', 'position']),
    declare_attack: action('ATTACK', ['attacker_id', 'defender_id']),
    end_turn: action('END_TURN', []),
    start_first_turn: action('START_FIRST_TURN', []),
    change_defensive_mode: action('CHANGE_DEFENSIVE_MODE', ['knight_id', 'mode']),
    use_ability: action('USE_ABILITY', ['card_id', 'ability_name', 'target_id'])
  };

  return { handlers, broadcastMatchUpdate };
}
