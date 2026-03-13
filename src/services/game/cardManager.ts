/**
 * CardManager.ts
 *
 * OrquestaciÃ³n transaccional para operaciones de cartas.
 *
 * PatrÃ³n unificado (runAction):
 *   idempotencia â†’ reload+lock â†’ mapear â†’ executor â†’ persist â†’ register
 *
 * Toda regla de juego vive en CardRulesEngine.
 * Toda traducciÃ³n de zona vive en ZoneMapper.
 * Las definiciones de habilidades se cachean en cardDefCache.
 */

import { sequelize } from '../../config/database';
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardAbility from '../../models/CardAbility';
import { CardRulesEngine, CardBdStats } from '../../engine/CardRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';
import { StatusEffect } from '../../engine/StatusEffects';
import { AbilityEngine } from '../../engine/abilities/AbilityEngine';
import { ZoneMapper } from '../../utils/ZoneMapper';
import { createEngineContext } from '../../engine/EngineContext';
import { GameEventType, createEvent } from '../../engine/events/GameEvents';

// â”€â”€ Card definition cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// card_id â†’ { bdStats, abilities }  (estÃ¡tico durante el proceso)
interface CardDef {
  bdStats: CardBdStats;
  abilities: any[];
}
const cardDefCache = new Map<string, CardDef>();

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
  if (!card) throw new Error(`DefiniciÃ³n de carta no encontrada: ${cardId}`);

  const knight: any = (card as any).card_knight;
  const bdStats: CardBdStats = {
    cost:      (card as any).cost      ?? 0,
    generate:  (card as any).generate  ?? 0,
    card_type: (card as any).type      ?? '',
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
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GENERIC TRANSACTION RUNNER  (same pattern as KnightManager)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  private static async runAction<T extends { newState: GameState }>(
    match: any,
    playerNumber: 1 | 2,
    actionId: string,
    actionName: string,
    executor: (state: GameState, tx: any) => Promise<T>,
  ): Promise<any> {
    try {
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[CardManager] ${actionName} ${actionId} ya procesada (retry)`);
        return { success: true, newState: cached.cached_result, isRetry: true };
      }

      const result = await sequelize.transaction(async (tx) => {
        await match.reload({ lock: tx.LOCK.UPDATE, transaction: tx });
        // Cargar cartas en juego con lock para que MatchStateMapper pueble
        // field_knights/hand, y el sweep de yomotsu en applyState sea correcto.
        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id: match.id },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        (match as any).cards_in_play = cardsInPlay;
        const state = MatchStateMapper.fromMatch(match);
        const execResult = await executor(state, tx);
        await MatchRepository.applyState(match, execResult.newState, tx);
        await ProcessedActionsRegistry.register(
          actionId, match.id, playerNumber, execResult.newState, actionName, tx,
        );
        return execResult;
      });

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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // PLAY CARD
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Juega una carta desde mano al campo.
   *
   * Flujo:
   *  1. Carga definiciÃ³n de carta (cache)
   *  2. Valida con CardRulesEngine (cosmos, zona, posiciÃ³n â€” dentro del lock)
   *  3. Aplica cosmos delta en GameState
   *  4. Mueve CardInPlay a la zona destino en BD
   *  5. Inicializa stats de caballero si aplica
   *  6. Aplica efectos pasivos de entrada (trigger CARD_PLAYED)
   */
  static async playCard(
    match: any,
    playerNumber: 1 | 2,
    cardId: string,        // instance_id de CardInPlay
    targetZone: string,    // zona en notaciÃ³n cliente
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
        // â”€â”€ Cargar carta con lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const cardInPlay = await CardInPlay.findOne({
          where: { id: cardId, match_id: match.id, player_number: playerNumber, zone: 'hand' },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
        });
        if (!cardInPlay) throw new Error('Carta no encontrada en la mano');

        const dbZone = ZoneMapper.toDatabase(targetZone);

        // â”€â”€ Cargar definiciÃ³n (cache) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const { bdStats, abilities } = await getCardDef((cardInPlay as any).card_id, tx);

        // â”€â”€ Leer conteo de zona con lock (evita race condition) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const zoneCards = await CardInPlay.findAll({
          where: { match_id: match.id, player_number: playerNumber, zone: dbZone },
          lock: tx.LOCK.UPDATE,
          transaction: tx,
          attributes: ['id', 'position'],
        });
        const zoneCurrentCount = zoneCards.length;
        const positionOccupied = zoneCards.some((c: any) => c.position === position);

        // â”€â”€ Validar (motor puro) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const v = CardRulesEngine.validatePlayCard(
          state, playerNumber, cardId, dbZone, position,
          bdStats.cost, zoneCurrentCount, positionOccupied,
        );
        if (!v.valid) throw new Error(v.error ?? 'ValidaciÃ³n fallida');

        // â”€â”€ Calcular nuevo estado de cosmos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const { newState } = CardRulesEngine.executePlayCard(
          state, playerNumber, cardId, dbZone, position, bdStats,
        );

        // â”€â”€ Inicializar stats de caballero si aplica â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Aplicar efectos pasivos de entrada al nodo en newState.
        // applyState persiste status_effects desde GameState a DB (step 4).
        if (bdStats.card_type === 'knight' && abilities.length > 0) {
          const entryEffects = AbilityEngine.getCardEntryEffects(abilities) as StatusEffect[];
          if (entryEffects.length > 0) {
            const pl = playerNumber === 1 ? newState.player1 : newState.player2;
            const cardInNewState =
              dbZone === 'field_knight'  ? pl.field_knights.find(c => c.instance_id === cardId) :
              dbZone === 'field_support' ? pl.field_techniques.find(c => c.instance_id === cardId) :
              dbZone === 'field_helper'  ? (pl.field_helper?.instance_id === cardId ? pl.field_helper : undefined) :
              undefined;
            if (cardInNewState) {
              const newTypes = new Set(entryEffects.map(e => e.type));
              cardInNewState.status_effects = [
                ...(cardInNewState.status_effects ?? []).filter((e: StatusEffect) => !newTypes.has(e.type)),
                ...entryEffects,
              ];
            }
          }
        }

        // Mueve zona+posicion en BD; stats los persiste applyState step 4.
        await (cardInPlay as any).update({ zone: dbZone, position }, { transaction: tx });

        // Emitir CARD_PLAYED (puede disparar pasivas de cartas ya en campo).
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

