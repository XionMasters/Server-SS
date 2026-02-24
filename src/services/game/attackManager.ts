/**
 * AttackManager.ts
 * 
 * Orquestación transaccional para el sistema de combate.
 * Mismo patrón que TurnManager Y CardManager.
 */

import { sequelize } from '../../config/database';
import Match from '../../models/Match';
import { AttackRulesEngine } from '../../engine/AttackRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';

export class AttackManager {
  /**
   * Ejecuta un ataque de una carta contra otra
   */
  static async attack(
    match: any,
    playerNumber: 1 | 2,
    attackerCardId: string,
    defenderCardId: string,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    damage: number;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[AttackManager] Acción ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          damage: (cached as any).damage || 0,
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(
        async (transaction) => {
          // 2️⃣ LOCK DE FILA
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          // 3️⃣ MAPEAR A ESTADO PURO
          const currentState = MatchStateMapper.fromMatch(match);

          // 4️⃣ VALIDAR
          const validation = AttackRulesEngine.validateAttack(
            currentState,
            playerNumber,
            attackerCardId,
            defenderCardId
          );
          if (!validation.valid) {
            throw new Error(validation.error || 'Validación fallida');
          }

          // 5️⃣ EJECUTAR
          const execution = AttackRulesEngine.attack(
            currentState,
            playerNumber,
            attackerCardId,
            defenderCardId
          );

          // 6️⃣ PERSISTIR
          await MatchRepository.applyState(match, execution.newState, transaction);

          // 7️⃣ REGISTRAR (con damage en result)
          const cacheData = { ...execution.newState, damage: execution.damage };
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            cacheData,
            'attack',  // actionType
            transaction
          );

          return { newState: execution.newState, damage: execution.damage };
        }
      );

      return {
        success: true,
        newState: result.newState,
        damage: result.damage,
      };
    } catch (error) {
      console.error('[AttackManager] Error en attack:', error);
      return {
        success: false,
        newState: null,
        damage: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * Cambia el modo defensivo de una carta
   */
  static async changeDefensiveMode(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    mode: 'normal' | 'defense' | 'evasion',
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[AttackManager] Acción ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN
      const result = await sequelize.transaction(
        async (transaction) => {
          // 2️⃣ LOCK
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          // 3️⃣ MAPEAR
          const currentState = MatchStateMapper.fromMatch(match);

          // 4️⃣ EJECUTAR (sin validación compleja)
          const execution = AttackRulesEngine.changeDefensiveMode(
            currentState,
            playerNumber,
            cardId,
            mode
          );

          // 5️⃣ PERSISTIR
          await MatchRepository.applyState(match, execution.newState, transaction);

          // 6️⃣ REGISTRAR
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            execution.newState,
            'defensive_mode_change',  // actionType
            transaction
          );

          return execution.newState;
        }
      );

      return { success: true, newState: result };
    } catch (error) {
      console.error('[AttackManager] Error en changeDefensiveMode:', error);
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
 * const result = await AttackManager.attack(match, 1, attId, defId, actionId);
 * if (result.success) {
 *   console.log(`Daño: ${result.damage}`);
 *   await WebSocketManager.broadcast(matchId, 'attack_executed', result);
 * }
 */
