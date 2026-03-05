/**
 * KnightManager.ts
 *
 * Orquestación transaccional para las acciones de caballero.
 * Mismo patrón que TurnManager / AttackManager.
 *
 * Acciones:
 * - chargeKnightCosmos  → +3 CP al jugador (puro GameState)
 * - sacrificeKnight     → -1 vida + mover carta a yomotsu
 * - moveKnight          → mover carta a nueva posición (solo BD, sin GameState)
 */

import { sequelize } from '../../config/database';
import { KnightRulesEngine } from '../../engine/KnightRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';
import CardInPlay from '../../models/CardInPlay';

export class KnightManager {
  // ══════════════════════════════════════════════════════════════════════════
  // CHARGE_COSMOS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cargar Cosmo: otorga cosmos_per_charge CP al jugador (3 según BASE_MATCH_RULES).
   */
  static async chargeKnightCosmos(
    match: any,
    playerNumber: 1 | 2,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    cosmosGained: number;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[KnightManager] chargeKnightCosmos ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          cosmosGained: (cached as any).cosmosGained || 0,
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(async (transaction) => {
        // 2️⃣ LOCK DE FILA
        await match.reload({ lock: transaction.LOCK.UPDATE, transaction });

        // 3️⃣ MAPEAR A ESTADO PURO
        const currentState = MatchStateMapper.fromMatch(match);

        // 4️⃣ VALIDAR
        const validation = KnightRulesEngine.validateChargeKnightCosmos(currentState, playerNumber);
        if (!validation.valid) {
          throw new Error(validation.error || 'Validación fallida');
        }

        // 5️⃣ EJECUTAR (puro)
        const execution = KnightRulesEngine.chargeKnightCosmos(currentState, playerNumber);

        // 6️⃣ PERSISTIR
        await MatchRepository.applyState(match, execution.newState, transaction);

        // 7️⃣ REGISTRAR
        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          execution.newState,
          'charge_cosmos',
          transaction
        );

        return { newState: execution.newState, cosmosGained: execution.cosmosGained };
      });

      return { success: true, ...result };
    } catch (error) {
      console.error('[KnightManager] Error en chargeKnightCosmos:', error);
      return {
        success: false,
        newState: null,
        cosmosGained: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SACRIFICE_KNIGHT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Sacrificar Caballero: -1 vida al jugador y mueve la carta al yomotsu.
   */
  static async sacrificeKnight(
    match: any,
    playerNumber: 1 | 2,
    cardInPlayId: string,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    lifeLost: number;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[KnightManager] sacrificeKnight ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          lifeLost: (cached as any).lifeLost || 1,
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(async (transaction) => {
        // 2️⃣ LOCK DE FILA
        await match.reload({ lock: transaction.LOCK.UPDATE, transaction });

        // 3️⃣ MAPEAR A ESTADO PURO
        const currentState = MatchStateMapper.fromMatch(match);

        // 4️⃣ VALIDAR
        const validation = KnightRulesEngine.validateSacrificeKnight(currentState, playerNumber);
        if (!validation.valid) {
          throw new Error(validation.error || 'Validación fallida');
        }

        // 4b️⃣ VALIDAR que la carta pertenece al jugador y está en campo
        const card = await CardInPlay.findOne({
          where: {
            id: cardInPlayId,
            match_id: match.id,
            player_number: playerNumber,
            zone: 'field_knight',
          },
          transaction,
        });
        if (!card) {
          throw new Error('Carta de caballero no encontrada en campo del jugador');
        }

        // 5️⃣ EJECUTAR (puro) – actualiza vida en GameState
        const execution = KnightRulesEngine.sacrificeKnight(currentState, playerNumber);

        // 5b️⃣ MOVER CARTA A YOMOTSU (operación BD)
        await card.update({ zone: 'yomotsu', position: 0 }, { transaction });

        // 6️⃣ PERSISTIR estado (vida actualizada)
        await MatchRepository.applyState(match, execution.newState, transaction);

        // 7️⃣ REGISTRAR
        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          execution.newState,
          'sacrifice_knight',
          transaction
        );

        return { newState: execution.newState, lifeLost: execution.lifeLost };
      });

      return { success: true, ...result };
    } catch (error) {
      console.error('[KnightManager] Error en sacrificeKnight:', error);
      return {
        success: false,
        newState: null,
        lifeLost: 0,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MOVE_KNIGHT
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Mover Caballero: cambia la posición de un caballero en el campo (0–4).
   * No hay cambio en GameState puro (posiciones no se trackean ahí aún).
   */
  static async moveKnight(
    match: any,
    playerNumber: 1 | 2,
    cardInPlayId: string,
    targetPosition: number,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    oldPosition: number;
    newPosition: number;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[KnightManager] moveKnight ${actionId} ya procesada (retry)`);
        return {
          success: true,
          newState: cached.cached_result,
          oldPosition: (cached as any).oldPosition ?? -1,
          newPosition: (cached as any).newPosition ?? targetPosition,
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(async (transaction) => {
        // 2️⃣ LOCK DE FILA
        await match.reload({ lock: transaction.LOCK.UPDATE, transaction });

        // 3️⃣ VALIDAR turno
        const currentState = MatchStateMapper.fromMatch(match);
        if (currentState.current_player !== playerNumber) {
          throw new Error(`No es turno del jugador ${playerNumber}`);
        }
        if (currentState.phase === 'game_over') {
          throw new Error('La partida ya terminó');
        }

        // Validar posición destino (0–4)
        if (targetPosition < 0 || targetPosition > 4) {
          throw new Error('Posición de destino inválida (0–4)');
        }

        // 4️⃣ VALIDAR carta origen
        const card = await CardInPlay.findOne({
          where: {
            id: cardInPlayId,
            match_id: match.id,
            player_number: playerNumber,
            zone: 'field_knight',
          },
          transaction,
        });
        if (!card) {
          throw new Error('Carta de caballero no encontrada en campo del jugador');
        }

        const oldPosition = card.position;

        // 5️⃣ VALIDAR que la posición destino esté libre
        const existingCard = await CardInPlay.findOne({
          where: {
            match_id: match.id,
            player_number: playerNumber,
            zone: 'field_knight',
            position: targetPosition,
          },
          transaction,
        });
        if (existingCard) {
          throw new Error('La posición destino ya está ocupada');
        }

        // 6️⃣ MOVER CARTA
        await card.update({ position: targetPosition }, { transaction });

        // 7️⃣ REGISTRAR (estado no cambia, pero registramos para idempotencia)
        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          currentState,
          'move_knight',
          transaction
        );

        return { newState: currentState, oldPosition, newPosition: targetPosition };
      });

      return { success: true, ...result };
    } catch (error) {
      console.error('[KnightManager] Error en moveKnight:', error);
      return {
        success: false,
        newState: null,
        oldPosition: -1,
        newPosition: -1,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
