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

// import { GameStateBuilder } from './GameStateBuilder'; // TODO: Not implemented yet
import { StartMatchService } from '../match/startMatch.service';
import { SearchMatchService } from '../match/searchMatch.service';
import { AbandonMatchService } from '../match/abandonMatch.service';
import { MatchStateService } from '../match/matchState.service';
import { CanSearchMatchService } from '../match/canSearchMatch.service';
import { MatchRecoveryService } from '../match/matchRecovery.service';
import { StartFirstTurnService } from '../match/startFirstTurn.service';
import { MatchCoordinator } from './matchCoordinator';

export class MatchesCoordinator {
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
        return this.normalizeEvents(result, userId);
      }

      case 'PLAY_CARD': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const result = await MatchCoordinator.playCard(
          matchId,
          userId,
          action.cardId || action.card_id,
          action.zone,
          action.position,
          actionId
        );
        return this.normalizeEvents(result, userId);
      }

      case 'ATTACK': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const result = await MatchCoordinator.attack(
          matchId,
          userId,
          action.attackerCardId || action.attacker_card_id || action.attacker_id,
          action.defenderCardId || action.defender_card_id || action.defender_id,
          actionId
        );
        return this.normalizeEvents(result, userId);
      }

      case 'CHANGE_DEFENSIVE_MODE': {
        if (!actionId) {
          return { success: false, code: 'ACTION_ID_REQUIRED', error: 'actionId es requerido' };
        }

        const result = await MatchCoordinator.changeDefensiveMode(
          matchId,
          userId,
          action.cardId || action.card_id || action.knight_id,
          action.mode,
          actionId
        );
        return this.normalizeEvents(result, userId);
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
  static async findMatchOrCreate(userId: string, userSockets?: Map<string, any>, userSocketSets?: Map<string, Set<any>>): Promise<{
    success: boolean;
    status: 'searching' | 'match_found';
    match_id: string;
    data?: any;
    error?: string;
  }> {
    try {
      // 1️⃣ DELEGAR: Buscar rival disponible
      const matchFound = await SearchMatchService.findAvailableMatch(userId, userSockets, userSocketSets);

      if (matchFound) {
        const matchData = await StartMatchService.startWaitingMatch(matchFound, userId);

        return {
          success: true,
          status: 'match_found',
          match_id: matchFound.id,
          data: matchData
        };
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
   * Busca rival disponible OR crea nueva partida en espera
   * DELEGA: Todas las validaciones a SearchMatchService y StartMatchService
   */
  static async findMatch(userId: string) {
    // Reemplazado por findMatchOrCreate
    return await this.findMatchOrCreate(userId);
  }


  /**
   * Crea match de prueba/test (para desarrollo)
   * DELEGA: Toda la lógica a StartMatchService
   */
  static async startTestMatch(userId: string) {
    try {
      return await StartMatchService.createNewMatch(userId, userId, 'TEST');
    } catch (error: any) {
      return { success: false, error: `Error creando test match: ${error?.message || 'Unknown error'}` };
    }
  }

  /**
   * Usuario abandona match
   * DELEGA: Toda la lógica a AbandonMatchService
   */
  static async abandonMatch(matchId: string, userId: string) {
    return await AbandonMatchService.abandonMatch(matchId, userId);
  }

  /**
   * Obtiene estado actual de match
   * DELEGA: Serialización a GameStateBuilder
   * 
   * TODO: Implementar GameStateBuilder
   */
  static async getMatchState(matchId: string, userId: string) {
    return await MatchStateService.getMatchStateForUser(matchId, userId);
  }

  /**
   * Verifica si el usuario puede buscar partida.
   * DELEGA: CanSearchMatchService
   */
  static async canSearchMatch(userId: string, username?: string) {
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
   * DELEGA: MatchRecoveryService
   */
  static async recoverOnSocketConnect(
    userId: string,
    isUserOnline: (userId: string) => boolean
  ) {
    try {
      const data = await MatchRecoveryService.recoverOnConnect(userId, isUserOnline);
      return { success: true, data };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Error recuperando partida activa'
      };
    }
  }
}
