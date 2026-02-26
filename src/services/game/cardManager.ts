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
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
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
      const result = await sequelize.transaction(async (transaction) => {
        // 2 LOCK DE FILA
        await match.reload({ lock: transaction.LOCK.UPDATE, transaction });

        // 3 VALIDAR: carta existe en la mano del jugador (query directo)
        const cardInPlay = await CardInPlay.findOne({
          where: { id: cardId, match_id: match.id, player_number: playerNumber, zone: 'hand' },
          include: [{ model: Card, as: 'card' }],
          transaction,
        });
        if (!cardInPlay) {
          throw new Error('Carta no encontrada en la mano');
        }

        // 4 VALIDAR: cosmos suficiente
        const cosmosField = `player${playerNumber}_cosmos`;
        const cardCost: number = (cardInPlay as any).card?.cost || 0;
        const currentCosmos: number = match[cosmosField] || 0;
        if (currentCosmos < cardCost) {
          throw new Error(`Cosmos insuficiente. Requiere: ${cardCost}, tienes: ${currentCosmos}`);
        }

        // 4b VALIDAR: zona no llena (máx 5 para knight/technique)
        const zonaConLimite = ['field_knight', 'field_technique'];
        if (zonaConLimite.includes(targetZone)) {
          const fieldCount = await CardInPlay.count({
            where: { match_id: match.id, player_number: playerNumber, zone: targetZone },
            transaction,
          });
          if (fieldCount >= 5) {
            throw new Error(`Zona ${targetZone} está llena (máximo 5)`);
          }
        }

        // 5 EJECUTAR: mover carta al campo
        (cardInPlay as any).zone = targetZone;
        (cardInPlay as any).position = position;
        await (cardInPlay as any).save({ transaction });

        // 6 DECREMENTAR cosmos en el modelo Match
        match[cosmosField] = currentCosmos - cardCost;
        await match.save({ transaction });

        // 7 REGISTRAR (idempotencia) - usamos estado mapeado del match actualizado
        const newState = MatchStateMapper.fromMatch(match);
        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          newState,
          'card_play',
          transaction
        );

        return newState;
      });

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