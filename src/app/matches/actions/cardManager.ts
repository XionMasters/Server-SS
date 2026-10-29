/**
 * CardManager.ts
 *
 * Orquestacion transaccional para operaciones de cartas.
 *
 * Patron unificado (runAction):
 *   idempotencia -> reload+lock -> mapear -> executor -> persist -> register
 *
 * Toda regla de juego vive en CardRulesEngine.
 * Toda traduccion de zona vive en ZoneMapper.
 * Las definiciones de habilidades se cachean en cardDefCache.
 */

import { sequelize } from '../../../config/database';
import CardInPlay from '../../../infrastructure/database/models/CardInPlay';
import Card from '../../../infrastructure/database/models/Card';
import CardKnight from '../../../infrastructure/database/models/CardKnight';
import CardAbility from '../../../infrastructure/database/models/CardAbility';
import { CardRulesEngine, CardBdStats } from '../../../domain/game/CardRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../../../infrastructure/database/repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../../../infrastructure/database/repositories/ProcessedActionsRegistry';
import { GameState } from '../../../domain/game/GameState';
import { StatusEffect } from '../../../domain/game/StatusEffects';
import { AbilityEngine } from '../../../domain/game/abilities/AbilityEngine';
import { ZoneMapper } from '../../../domain/game/ZoneMapper';
import { normalizeCardType } from '../../../domain/game/CardTypes';
import { createEngineContext } from '../../../domain/game/EngineContext';
import { GameEventType, createEvent } from '../../../domain/game/events/GameEvents';
import { createCardDefinitionCache } from '../../../infrastructure/cache/card-definition.cache';
import { attachCardDefinitions } from './attachCardDefinitions';

// Card definition cache
// card_id -> { bdStats, abilities }; admin la invalida al editar o borrar cartas
interface CardDef {
  bdStats: CardBdStats;
  abilities: any[];
}
const cardDefCache = createCardDefinitionCache<CardDef>();

async function getCardDef(cardId: string, tx: any): Promise<CardDef> {
  if (cardDefCache.has(cardId)) return cardDefCache.get(cardId)!;

  const [card, abilities] = await Promise.all([
    Card.findOne({
      where: { id: cardId },
      include: [{ model: CardKnight, as: 'card_knight' }],
      transaction: tx,
    }),
    CardAbility.findAll({ where: { card_id: cardId }, transaction: tx }),
  ]);
  if (!card) throw new Error(`Definicion de carta no encontrada: ${cardId}`);

  const knight: any = (card as any).card_knight;
  const bdStats: CardBdStats = {
    cost:      (card as any).cost      ?? 0,
    generate:  (card as any).generate  ?? 0,
    card_type: normalizeCardType((card as any).type),
    health:    knight?.health,
    attack:    knight?.attack,
    defense:   knight?.defense,
    cosmos:    knight?.cosmos,
  };

  const def: CardDef = { bdStats, abilities };
  cardDefCache.set(cardId, def);
  return def;
}

export class CardManager {
  // ==========================================================================
  // GENERIC TRANSACTION RUNNER  (same pattern as KnightManager)
  // ==========================================================================

  private static async runAction<T extends { newState: GameState }>(
    match: any,
    playerNumber: 1 | 2,
    actionId: string,
    actionName: string,
    executor: (state: GameState, tx: any) => Promise<T>,
  ): Promise<any> {
    try {
      const cached = await ProcessedActionsRegistry.find(actionId, {
        matchId: match.id,
        playerNumber,
        actionType: actionName,
      });
      if (cached) {
        console.log(`[CardManager] ${actionName} ${actionId} ya procesada (retry)`);
        return { success: true, newState: cached.cached_result, isRetry: true };
      }

      const result = await sequelize.transaction(async (tx) => {
        await match.reload({ lock: tx.LOCK.UPDATE, transaction: tx });
        const cachedInTransaction = await ProcessedActionsRegistry.find(actionId, {
          transaction: tx,
          matchId: match.id,
          playerNumber,
          actionType: actionName,
        });
        if (cachedInTransaction) {
          return { cachedResult: cachedInTransaction.cached_result, isRetry: true as const };
        }

        // Cargar cartas en juego con lock para que MatchStateMapper pueble
        // field_knights/hand, y el sweep de yomotsu en applyState sea correcto.
        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id: match.id },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        await attachCardDefinitions(cardsInPlay, tx);
        (match as any).cards_in_play = cardsInPlay;
        const state = MatchStateMapper.fromMatch(match);
        const execResult = await executor(state, tx);
        await MatchRepository.applyState(match, execResult.newState, tx);
        await ProcessedActionsRegistry.register(
          actionId, match.id, playerNumber, execResult.newState, actionName, tx,
        );
        return { ...execResult, isRetry: false as const };
      });

      if (result.isRetry) {
        return { success: true, newState: result.cachedResult, isRetry: true };
      }
      return { success: true, ...result };
    } catch (error) {
      console.error(`[CardManager] Error en ${actionName}:`, error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // ============================================================================
  // PLAY CARD
  // ============================================================================

  /**
   * Juega una carta desde mano al campo.
   *
   * Flujo:
    *  1. Carga definicion de carta (cache)
    *  2. Valida con CardRulesEngine (cosmos, zona, posicion, dentro del lock)
   *  3. Aplica cosmos delta en GameState
   *  4. Mueve CardInPlay a la zona destino en BD
   *  5. Inicializa stats de caballero si aplica
   *  6. Aplica efectos pasivos de entrada (trigger CARD_PLAYED)
   */
  static async playCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,        // instance_id de CardInPlay
    targetZone: string,    // zona en notacion cliente
    position: number,
    actionId: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
    isRetry?: boolean;
  }> {
    return this.runAction(
      match, playerNumber, actionId, 'card_play',
      async (state, tx) => {
        // Cargar carta con lock.
        const cardInPlay = await CardInPlay.findOne({
          where: { id: cardId, match_id: match.id, player_number: playerNumber, zone: 'hand' },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });
        if (!cardInPlay) throw new Error('Carta no encontrada en la mano');

        const dbZone = ZoneMapper.toDatabase(targetZone);

        // Cargar definicion (cache)
        const { bdStats, abilities } = await getCardDef((cardInPlay as any).card_id, tx);

        // ── Leer conteo de zona con lock (evita race condition) ────────────
        // Para field_scenario: no filtramos por player_number (el escenario es compartido).
        const scenarioZone = dbZone === 'field_scenario';
        const zoneQuery = scenarioZone
          ? { match_id: match.id, zone: dbZone }
          : { match_id: match.id, player_number: playerNumber, zone: dbZone };

        const zoneCards = await CardInPlay.findAll({
          where: zoneQuery,
          lock: tx.LOCK.UPDATE,
          transaction: tx,
          attributes: ['id', 'card_id', 'position'],
        });

        // ── Reemplazo de escenario ──────────────────────────────────────────
        // Si ya existe un escenario, verificar si puede ser reemplazado.
        // Si puede, moverlo al yomotsu antes de validar la nueva jugada.
        let effectiveCount = zoneCards.length;
        let effectivePositionOccupied = zoneCards.some((c: any) => c.position === position);

        if (scenarioZone && zoneCards.length > 0) {
          const existing = zoneCards[0] as any;
          const existingDef = await getCardDef(existing.card_id, tx);
          const cannotReplace = existingDef.abilities.some(
            (a: any) =>
              a.effects?.cannot_be_replaced === true ||
              a.effects?.indestructible === true,
          );
          if (cannotReplace) {
            throw new Error('El escenario activo no puede ser reemplazado');
          }
          // Mover escenario anterior al yomotsu
          await existing.update({ zone: 'yomotsu' }, { transaction: tx });
          effectiveCount = 0;
          effectivePositionOccupied = false;
        }

        const zoneCurrentCount = effectiveCount;
        const positionOccupied = effectivePositionOccupied;

        // Validar con el motor puro.
        const v = CardRulesEngine.validatePlayCard(
          state, playerNumber, cardId, dbZone, position,
          bdStats.cost, zoneCurrentCount, positionOccupied,
        );
        if (!v.valid) throw new Error(v.error ?? 'Validacion fallida');

        // Calcular nuevo estado de cosmos.
        const { newState } = CardRulesEngine.executePlayCard(
          state, playerNumber, cardId, dbZone, position, bdStats,
        );

        // Mueve zona+posicion en BD; stats los persiste applyState step 4.
        await (cardInPlay as any).update({ zone: dbZone, position }, { transaction: tx });

        // Emitir CARD_PLAYED: dispara las pasivas de entrada de la propia carta
        // (con raw_abilities cargadas por attachCardDefinitions), el efecto de
        // ocasiones/objetos/escenarios/helpers y las pasivas de cartas ya en campo.
        const ctx = createEngineContext(newState);
        ctx.bus.emit(createEvent({
          type: GameEventType.CARD_PLAYED,
          playerNumber,
          sourceCardId: cardId,
          payload: { zone: dbZone, position },
        }));
        return { newState: ctx.state, events: [...ctx.bus.events] };
      },
    );
  }

  // ============================================================================
  // DISCARD CARD  (futuro)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  static async discardCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    actionId: string,
  ): Promise<{ success: boolean; newState: GameState | null; error?: string }> {
    return this.runAction(
      match, playerNumber, actionId, 'card_discard',
      async (state) => {
        return CardRulesEngine.discardCard(state, playerNumber, cardId);
      },
    );
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MOVE CARD  (futuro)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  static async moveCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,
    fromZone: string,
    toZone: string,
    toPosition: number,
    actionId: string,
  ): Promise<{ success: boolean; newState: GameState | null; error?: string }> {
    return this.runAction(
      match, playerNumber, actionId, 'card_move',
      async (state) => {
        return CardRulesEngine.moveCard(
          state, playerNumber, cardId,
          ZoneMapper.toDatabase(fromZone),
          ZoneMapper.toDatabase(toZone),
          toPosition,
        );
      },
    );
  }
}
