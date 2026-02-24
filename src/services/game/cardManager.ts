/**
 * CardManager.ts
 * 
 * Orquestación transaccional para operaciones de cartas.
 * Patrón igual que TurnManager:
 * 
 * 0. ProcessedActionsRegistry.find(actionId)
 * 1. sequelize.transaction({lock})
 * 2. MatchStateMapper.fromMatch()
 * 3. CardRulesEngine.validate()
 * 4. CardRulesEngine.execute()
 * 5. MatchRepository.applyState()
 * 6. ProcessedActionsRegistry.register()
 */

import { sequelize } from '../../config/database';
import Match from '../../models/Match';
import { CardRulesEngine } from '../../engine/CardRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';

export class CardManager {
  /**
   * Juega una carta desde mano al campo
   */
  static async playCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    targetZone: string,
    position: number,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0 IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[CardManager] Acción ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          isRetry: true,
        };
      }

      // 1 TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(

        async (transaction) => {
          // 2 LOCK DE FILA
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          // 3 MAPEAR A ESTADO PURO
          const currentState = MatchStateMapper.fromMatch(match);

          // 4 VALIDAR
          const validation = CardRulesEngine.validatePlayCard(
            currentState,
            playerNumber,
            cardId,
            targetZone,
            position
          );
          if (!validation.valid) {
            throw new Error(validation.error || 'Validación fallida');
          }

          // 5 EJECUTAR
          const execution = CardRulesEngine.playCard(
            currentState,
            playerNumber,
            cardId,
            targetZone,
            position
          );

          // 6 PERSISTIR
          await MatchRepository.applyState(match, execution.newState, transaction);

          // 7 REGISTRAR
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            execution.newState,
            'card_play',
            transaction
          );

          return execution.newState;
        }
      );

      return { success: true, newState: result };
    } catch (error) {
      console.error('[CardManager] Error en playCard:', error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * (FUTURO) Descartar carta
   */
  static async discardCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
  }> {
    try {
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        return {
          success: true,
          newState: cached.cached_result,
        };
      }

      const result = await sequelize.transaction(
        async (transaction) => {
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          const currentState = MatchStateMapper.fromMatch(match);
          const execution = CardRulesEngine.discardCard(currentState, playerNumber, cardId);

          await MatchRepository.applyState(match, execution.newState, transaction);
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            execution.newState,
            'card_discard',
            transaction
          );

          return execution.newState;
        }
      );

      return { success: true, newState: result };
    } catch (error) {
      console.error('[CardManager] Error en discardCard:', error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * (FUTURO) Mover carta en el campo
   */
  static async moveCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    fromZone: string,
    toZone: string,
    toPosition: number,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
  }> {
    try {
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        return { success: true, newState: cached.cached_result };
      }

      const result = await sequelize.transaction(
        async (transaction) => {
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          const currentState = MatchStateMapper.fromMatch(match);
          const execution = CardRulesEngine.moveCard(
            currentState,
            playerNumber,
            cardId,
            fromZone,
            toZone,
            toPosition
          );

          await MatchRepository.applyState(match, execution.newState, transaction);
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            execution.newState,
            'card_move',
            transaction
          );

          return execution.newState;
        }
      );

      return { success: true, newState: result };
    } catch (error) {
      console.error('[CardManager] Error en moveCard:', error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}

/**
 * Patrón de uso:
 * 
 * // En MatchCoordinator
 * const result = await CardManager.playCard(match, playerNumber, cardId, zone, pos, actionId);
 * if (result.success) {
 *   await WebSocketManager.broadcast(matchId, 'card_played', result);
 * }
 */