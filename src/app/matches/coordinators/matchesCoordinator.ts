/**
 * MatchesCoordinator.ts
 * 
 * PURO ORQUESTADOR - Delega TODO a servicios especializados
 * 
 * Responsabilidades:
 * ✅ Orquestar búsqueda de rival (SearchMatchService)
 * ✅ Orquestar creación de partida (StartMatchService)
 * ✅ Decisiones simples de flujo
 * 
 * ❌ NO hace búsqueda de rivales (eso es SearchMatchService)
 * ❌ NO crea partidas (eso es StartMatchService)
 * ❌ NO inicializa cartas (eso es MatchSetupService)
 * ❌ NO valida reglas (eso es GameRulesEngine)
 * 
 * Patrón: Thin Coordinator, Specialized Services
 */

import { StartMatchService } from '../lifecycle/startMatch.service';
import { applyHandVisibility } from '../serializers/handVisibility';
import { SearchMatchService } from '../lifecycle/searchMatch.service';
import { AbandonMatchService } from '../lifecycle/abandonMatch.service';
import { MatchStateService } from '../lifecycle/matchState.service';
import { CanSearchMatchService } from '../lifecycle/canSearchMatch.service';
import { StartFirstTurnService } from '../lifecycle/startFirstTurn.service';
import { MatchCoordinator } from './matchCoordinator';
import { ActionResolver } from '../actions/ActionResolver';
import { RecoverMatchOnConnectUseCase } from '../recover-match-on-connect.use-case';
import { SequelizeMatchRecoveryRepository } from '../../../infrastructure/database/repositories/SequelizeMatchRecoveryRepository';

const recoverMatchOnConnect = new RecoverMatchOnConnectUseCase(
  new SequelizeMatchRecoveryRepository(),
);

type MatchNotifier = (userIds: string[], event: string, payload: any) => void;

const MAX_CLAIM_ATTEMPTS = 3;

export class MatchesCoordinator {
  private notifier: MatchNotifier | null = null;

  /**
   * Permite a la capa de transporte (WebSocket) recibir notificaciones
   * originadas fuera de un handler WS (p. ej. abandono vía HTTP).
   */
  setNotifier(notifier: MatchNotifier) {
    this.notifier = notifier;
  }

  /**
   * Construye los match_update por jugador (con visibilidad de mano aplicada)
   * para un estado de partida ya persistido.
   */
  async buildMatchUpdateEvents(matchId: string, lastAction: Record<string, any> | null = null): Promise<any[]> {
    const result = await this._buildMatchUpdateResult({ success: true, events: [] }, matchId, '', lastAction);
    return result?.events ?? [];
  }

  /**
   * Filtra los engine_events del motor (GameEvent[]) para un jugador específico.
   *
   * Reglas de visibilidad:
   *   ALLY_DREW_CARD     → solo el jugador que robó (playerNumber === forPlayer) — incluye cardId
   *   OPPONENT_DREW_CARD → solo el rival del que robó (playerNumber !== forPlayer) — sin cardId
   *   resto              → ambos jugadores lo ven
   */
  private _filterEngineEventsForPlayer(events: any[], forPlayerNumber: number): any[] {
    return events.filter(evt => {
      if (evt.type === 'ALLY_DREW_CARD')     return evt.playerNumber === forPlayerNumber;
      if (evt.type === 'OPPONENT_DREW_CARD') return evt.playerNumber !== forPlayerNumber;
      return true;
    });
  }

  private normalizeEvents(result: any, userId: string) {
    if (!result?.events || !Array.isArray(result.events)) {
      return result;
    }

    const events = result.events.map((evt: any) => {
      if (evt?.recipients) {
        return evt;
      }

      if (evt?.scope === 'self') {
        return {
          ...evt,
          recipients: { type: 'self' }
        };
      }

      if (evt?.scope === 'users') {
        return {
          ...evt,
          recipients: { type: 'users', userIds: evt.userIds || [] }
        };
      }

      if (evt?.scope === 'broadcast') {
        return {
          ...evt,
          recipients: { type: 'broadcast' }
        };
      }

      if (evt?.scope === 'match') {
        const userIds = [evt.player1Id, evt.player2Id].filter(Boolean);
        return {
          ...evt,
          recipients: { type: 'users', userIds }
        };
      }

      return {
        ...evt,
        recipients: { type: 'self', userId }
      };
    });

    return {
      ...result,
      events
    };
  }

  private async _buildMatchUpdateResult(actionResult: any, matchId: string, userId: string, lastAction: Record<string, any> | null = null) {
    if (!actionResult?.success) {
      return this.normalizeEvents(actionResult, userId);
    }

    // Construir estado actualizado desde BD para broadcast a ambos jugadores
    const stateResult = await MatchStateService.buildBroadcastMatchState(matchId);

    if (!stateResult.success || !stateResult.data) {
      console.warn('[MatchesCoordinator] No se pudo construir match_update:', stateResult.error);
      return { success: true };
    }

    const matchData = stateResult.data;
    // Inyectar valid_actions ANTES de separar por perspectiva, para que ActionResolver
    // vea TODAS las cartas en campo (propias + rivales) y calcule targets correctos.
    matchData.cards_in_play = ActionResolver.resolve(
      matchData.cards_in_play || [],
      matchData
    );

    const player1Id = matchData.player1?.id || matchData.player1_id;
    const player2Id = matchData.player2?.id || matchData.player2_id;
    const isTestMatch = player1Id && player1Id === player2Id;
    const engineEvents: any[] = actionResult?.events ?? [];

    if (isTestMatch) {
      // En TEST: el jugador activo ve su mano; el inactivo ve dorsos
      const activePlayer: number = matchData.current_player || 1;

      const testMatchData = {
        ...matchData,
        last_action: lastAction ?? null,
        perspective_player: activePlayer,
        cards_in_play: applyHandVisibility(matchData.cards_in_play || [], activePlayer),
        engine_events: this._filterEngineEventsForPlayer(engineEvents, activePlayer),
      };

      return {
        success: true,
        events: [
          {
            type: 'match_update',
            payload: testMatchData,
            recipients: { type: 'users', userIds: [player1Id] }
          }
        ]
      };
    }

    // PvP normal: cada jugador ve su propia mano, la del rival como dorsos
    const forPlayer = (playerNumber: number) => ({
      ...matchData,
      last_action: lastAction ?? null,
      perspective_player: playerNumber,
      cards_in_play: applyHandVisibility(matchData.cards_in_play || [], playerNumber),
      engine_events: this._filterEngineEventsForPlayer(engineEvents, playerNumber),
    });

    return {
      success: true,
      events: [
        {
          type: 'match_update',
          payload: forPlayer(1),
          recipients: { type: 'users', userIds: [player1Id].filter(Boolean) }
        },
        {
          type: 'match_update',
          payload: forPlayer(2),
          recipients: { type: 'users', userIds: [player2Id].filter(Boolean) }
        }
      ]
    };
  }

  async handleAction(input: { userId: string; action: any }): Promise<any> {
    const userId = input.userId;
    const action = input.action || {};
    const type = String(action.type || '').toUpperCase();

    const matchId = action.matchId || action.match_id;
    const actionId = action.actionId || action.action_id;

    if (!type) {
      return { success: false, code: 'ACTION_TYPE_REQUIRED', error: 'type es requerido' };
    }

    if (!matchId) {
      return { success: false, code: 'MATCH_ID_REQUIRED', error: 'matchId es requerido' };
    }

    switch (type) {
      case 'END_TURN': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const result = await MatchCoordinator.endTurn(matchId, userId, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, { type: 'end_turn' });
      }

      case 'PLAY_CARD': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const cardId = action.cardId || action.card_id;
        const result = await MatchCoordinator.playCard(matchId, userId, cardId, action.zone, action.position, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'play_card',
          card_id: cardId,
          zone: action.zone,
          position: action.position,
        });
      }

      case 'ATTACK': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const attackerCardId = action.attackerCardId || action.attacker_card_id || action.attacker_id;
        const defenderCardId = (action.defenderCardId || action.defender_card_id || action.defender_id) || null;
        const result = await MatchCoordinator.attack(matchId, userId, attackerCardId, defenderCardId, actionId);
        const attackResult = result as any;
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'attack',
          attacker_id: attackerCardId,
          defender_id: defenderCardId,
          damage: attackResult.damage ?? 0,
          evaded: attackResult.evaded ?? false,
        });
      }

      case 'TECHNIQUE_ATTACK': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const knightCardId = action.knightCardId || action.knight_card_id || action.knight_id;
        const techniqueCardId = action.techniqueCardId || action.technique_card_id || action.technique_id;
        const defenderCardId = (action.defenderCardId || action.defender_card_id || action.defender_id) || null;

        if (!knightCardId) {
          return { success: false, code: 'KNIGHT_ID_REQUIRED', error: 'knight_id es requerido' };
        }
        if (!techniqueCardId) {
          return { success: false, code: 'TECHNIQUE_ID_REQUIRED', error: 'technique_id es requerido' };
        }

        const result = await MatchCoordinator.useTechnique(
          matchId,
          userId,
          knightCardId,
          techniqueCardId,
          defenderCardId,
          actionId,
        );

        const taResult = result as any;
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'technique_attack',
          knight_id: knightCardId,
          technique_id: techniqueCardId,
          defender_id: defenderCardId,
          total_damage: taResult.totalDamage ?? 0,
          hit_count: taResult.hitCount ?? 0,
        });
      }

      case 'CHANGE_DEFENSIVE_MODE': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const cardId = action.cardId || action.card_id || action.knight_id;
        const result = await MatchCoordinator.changeDefensiveMode(matchId, userId, cardId, action.mode, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'change_mode',
          card_id: cardId,
          mode: action.mode,
        });
      }

      case 'CHARGE_COSMOS': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const result = await MatchCoordinator.chargeKnightCosmos(matchId, userId, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, { type: 'charge_cosmos' });
      }

      case 'SACRIFICE_KNIGHT': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const cardId = action.cardId || action.card_id || action.card_in_play_id;
        const result = await MatchCoordinator.sacrificeKnight(matchId, userId, cardId, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, { type: 'sacrifice', card_id: cardId });
      }

      case 'MOVE_KNIGHT': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const targetPosition = action.targetPosition ?? action.target_position ?? action.position;
        if (typeof targetPosition !== 'number') {
          return { success: false, code: 'TARGET_POSITION_REQUIRED', error: 'targetPosition es requerido (0–4)' };
        }

        const cardId = action.cardId || action.card_id || action.card_in_play_id;
        const result = await MatchCoordinator.moveKnight(matchId, userId, cardId, targetPosition, actionId);
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'move',
          card_id: cardId,
          to_position: targetPosition,
        });
      }

      case 'USE_ABILITY': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const cardId = action.cardId || action.card_id || action.card_in_play_id;
        const abilityName: string = (action.abilityName || action.ability_name || '').toLowerCase();
        const targetId: string | undefined = action.targetId || action.target_id || undefined;
        if (!cardId) {
          return { success: false, code: 'CARD_ID_REQUIRED', error: 'cardId es requerido' };
        }
        if (!abilityName) {
          return { success: false, code: 'ABILITY_NAME_REQUIRED', error: 'abilityName es requerido' };
        }

        const result = await MatchCoordinator.useKnightAbility(matchId, userId, cardId, abilityName, actionId, targetId);
        return this._buildMatchUpdateResult(result, matchId, userId, {
          type: 'use_ability',
          card_id: cardId,
          ability_name: abilityName,
          target_id: targetId,
          ...((result as any).extras ?? {}),
        });
      }

      case 'START_FIRST_TURN': {
        const result = await this.startFirstTurn(matchId, userId);
        return this.normalizeEvents(result, userId);
      }

      default:
        return {
          success: false,
          code: 'UNKNOWN_ACTION_TYPE',
          error: `Tipo de acción desconocido: ${type}`
        };
    }
  }

  /**
   * ORQUESTADOR: Busca rival O crea nueva partida en espera
   * 
   * Delegación:
   * ✅ SearchMatchService → Búsqueda de rival (FIFO, conexiones, etc.)
    * ✅ StartMatchService → Crear waiting match / iniciar match encontrado
   * 
   * Retorna:
   * - { success: true, status: 'match_found', data: {...} }
   * - { success: true, status: 'searching', match_id: '...' }
   * - { success: false, error: '...' }
   */
  async findMatchOrCreate(userId: string, userSockets?: Map<string, any>, userSocketSets?: Map<string, Set<any>>): Promise<{
    success: boolean;
    status: 'searching' | 'match_found';
    match_id: string;
    data?: any;
    error?: string;
  }> {
    try {
      // 1️⃣ DELEGAR: Buscar rival disponible. Si otro jugador reclama la misma
      // partida en espera a la vez, startWaitingMatch devuelve null y se reintenta.
      for (let attempt = 0; attempt < MAX_CLAIM_ATTEMPTS; attempt++) {
        const matchFound = await SearchMatchService.findAvailableMatch(userId, userSockets, userSocketSets);
        if (!matchFound) break;

        const matchData = await StartMatchService.startWaitingMatch(matchFound, userId);
        if (matchData) {
          return {
            success: true,
            status: 'match_found',
            match_id: matchFound.id,
            data: matchData
          };
        }
      }

      // 2️⃣ NO HAY RIVAL: Crear nueva partida en espera
      console.log(`⏳ Sin rivales disponibles, usuario entra en cola`);
      const waitingMatch = await StartMatchService.createWaitingMatch(userId);

      return {
        success: true,
        status: 'searching',
        match_id: waitingMatch.id,
        data: {
          message: 'Buscando rival...',
          match_id: waitingMatch.id
        }
      };

    } catch (error: any) {
      console.error('❌ Error en findMatchOrCreate:', error);
      return {
        success: false,
        status: 'searching',
        match_id: '',
        error: error?.message || 'Error al buscar partida'
      };
    }
  }

  /**
   * Usuario abandona match
   * DELEGA: Toda la lógica a AbandonMatchService y notifica a ambos jugadores
   */
  async abandonMatch(matchId: string, userId: string) {
    const result = await AbandonMatchService.abandonMatch(matchId, userId);

    if (result.success && result.player_ids && this.notifier) {
      this.notifier(result.player_ids, 'match_finished', {
        match_id: matchId,
        winner_id: result.winner_id,
        reason: 'abandon',
        abandoned_by: userId,
      });
    }

    return result;
  }

  /**
   * Obtiene estado actual de match
   * DELEGA: Serialización a GameStateBuilder
   * 
   * TODO: Implementar GameStateBuilder
   */
  async getMatchState(matchId: string, userId: string) {
    return await MatchStateService.getMatchStateForUser(matchId, userId);
  }

  /**
   * Verifica si el usuario puede buscar partida.
   * DELEGA: CanSearchMatchService
   */
  async canSearchMatch(userId: string, username?: string) {
    try {
      const data = await CanSearchMatchService.evaluate(userId, username);
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        data: {
          can_search: false,
          reason: 'SERVER_ERROR',
          message: 'Error verificando el mazo'
        },
        error: error?.message || 'Error verificando el mazo'
      };
    }
  }

  /**
   * Inicia el primer turno de una partida en fase starting.
   * DELEGA: StartFirstTurnService
   */
  async startFirstTurn(matchId: string, userId: string) {
    const result = await StartFirstTurnService.execute(matchId, userId);
    return this.normalizeEvents(result, userId);
  }

  /**
   * Recupera contexto de partida al reconectar socket.
   * DELEGA: RecoverMatchOnConnectUseCase
   */
  async recoverOnSocketConnect(
    userId: string,
    isUserOnline: (userId: string) => boolean
  ) {
    try {
      const data = await recoverMatchOnConnect.execute(userId, isUserOnline);
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Error recuperando partida activa'
      };
    }
  }
}

// Singleton compartido entre HTTP controllers y WebSocket service
export const matchesCoordinator = new MatchesCoordinator();
