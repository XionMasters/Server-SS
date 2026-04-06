/**
 * SelectionService.ts
 *
 * Maneja la resolución de selecciones interactivas (resolve_selection).
 *
 * Flujo:
 *   1. Cliente envía: { match_id, selection_id, chosen_card_id }
 *   2. Se valida que exista pending_selection con ese selection_id
 *   3. Se valida que chosen_card_id sea una opción válida (zona + filtro)
 *   4. Para deck search: la carta se carga desde BD a passive_watchers del engine state
 *   5. Se ejecutan on_select con selectedCardId = chosen_card_id
 *   6. Si hay shuffle_deck en extras: se mezclan las posiciones del mazo en BD
 *   7. Se limpia pending_selection
 *   8. Se persiste y se broadcastea el estado
 */

import { sequelize } from '../../config/database';
import { QueryTypes } from 'sequelize';
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardAbility from '../../models/CardAbility';
import Match from '../../models/Match';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { GameState, PendingSelection } from '../../engine/GameState';
import { ActionRegistry, ActionContext, ActionResult } from '../../engine/actions/ActionRegistry';
import { createEngineContext } from '../../engine/EngineContext';
import { GameEventBus } from '../../engine/events/GameEventBus';
import { createEvent } from '../../engine/events/GameEvents';
import { parseStatusEffects, computeCeBonus, computeArBonus, deriveModeFromEffects } from '../../engine/StatusEffects';
import { CardDrawService } from './CardDrawService';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';

export interface ResolveSelectionInput {
  match_id: string;
  user_id: string;
  selection_id: string;
  chosen_card_id: string;
  action_id: string;
}

export class SelectionService {
  /**
   * Resuelve una selección interactiva pendiente.
   * Valida, ejecuta on_select y persiste el nuevo estado.
   */
  static async resolveSelection(input: ResolveSelectionInput): Promise<{
    success: boolean;
    error?: string;
    code?: string;
    newState?: GameState;
  }> {
    const { match_id, user_id, selection_id, chosen_card_id, action_id } = input;

    // Idempotencia
    const cached = await ProcessedActionsRegistry.find(action_id);
    if (cached) {
      return { success: true, newState: cached.cached_result };
    }

    try {
      const result = await sequelize.transaction(async (tx) => {
        // 1. Cargar match con lock
        const match = await Match.findByPk(match_id, { transaction: tx });
        if (!match) throw new Error('Partida no encontrada');

        // 2. Determinar playerNumber del solicitante
        const playerNumber = match.player1_id === user_id ? 1
          : match.player2_id === user_id ? 2 : null;
        if (!playerNumber) throw new Error('No eres jugador de esta partida');

        // 3. Cargar cartas en juego (para mapear el GameState completo)
        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id },
          include: [{
            model: Card,
            as: 'card',
            include: [
              { model: CardKnight, as: 'card_knight' },
              { model: CardAbility, as: 'card_abilities' }
            ]
          }],
          transaction: tx,
        });
        (match as any).cards_in_play = cardsInPlay;
        const state = MatchStateMapper.fromMatch(match);

        // 4. Validar que existe la pending_selection
        const pending = state.pending_selection;
        if (!pending) throw new Error('No hay selección pendiente en esta partida');
        if (pending.id !== selection_id) {
          throw new Error(`ID de selección incorrecto. Esperado: ${pending.id}`);
        }
        if (pending.player_number !== playerNumber) {
          throw new Error('No es tu turno de seleccionar');
        }

        // 5. Validar que la carta elegida es una opción válida
        await this._validateChoice(match_id, state, pending, chosen_card_id, tx);

        // 6. Para deck search: cargar la carta en passive_watchers del engine state
        if (pending.zone === 'deck') {
          const deckCard = cardsInPlay.find(
            (c: any) => c.id === chosen_card_id && c.zone === 'deck'
          );
          if (!deckCard) throw new Error('Carta no encontrada en el mazo');

          const cardState = this._mapCardToState(deckCard);
          cardState.zone = 'deck'; // mantener zona para que send_to_zone sepa el origen
          const player = playerNumber === 1 ? state.player1 : state.player2;
          player.passive_watchers.push(cardState);
          if (player.deck_count > 0) player.deck_count -= 1;
        }

        // 7. Ejecutar on_select con selectedCardId
        const bus = new GameEventBus();
        const rng = SelectionService._createSeededRng(action_id);
        const selectionEvent = createEvent({
          type: 'SELECTION_RESOLVED',
          playerNumber,
          sourceCardId: pending.source_card_id,
          origin: 'player',
          payload: {
            selection_id,
            chosen_card_id,
            source_card_id: pending.source_card_id,
            zone: pending.zone,
          },
        });

        const actionCtx: ActionContext = {
          playerNumber,
          sourceCardId: pending.source_card_id,
          event: selectionEvent,
          rng,
          bus,
          selectedCardId: chosen_card_id,
        };

        const actionResult: ActionResult = {
          state,
          affectedIds: [],
          extras: {},
        };

        ActionRegistry.executeAll(pending.on_select, actionCtx, actionResult);

        // 8. Shuffle deck si fue marcado por shuffle_deck action
        if (Array.isArray(actionResult.extras.shuffle_deck_players)) {
          for (const pNum of actionResult.extras.shuffle_deck_players as number[]) {
            await this._shuffleDeck(match_id, pNum, tx, rng);
          }
        }

        // 8b. Robar cartas si draw_card action fue ejecutada en on_select
        if (actionResult.extras.draw_card_count && actionResult.extras.draw_card_count > 0) {
          const drawPlayer = (actionResult.extras.draw_card_player ?? playerNumber) as 1 | 2;
          const drawCount = actionResult.extras.draw_card_count as number;
          for (let i = 0; i < drawCount; i++) {
            await CardDrawService.drawCard(match_id, drawPlayer, tx);
          }
        }

        // 9. Limpiar pending_selection
        actionResult.state.pending_selection = null;

        // 10. Persistir nuevo estado
        await MatchRepository.applyState(match, actionResult.state, tx);

        // 11. Sincronizar zona en BD para cartas movidas por on_select
        // Necesario para cartas de deck/hand que no fueron cargadas en GameState completo.
        const sentCards: any[] = Array.isArray(actionResult.extras.sent_to_zone)
          ? actionResult.extras.sent_to_zone
          : (actionResult.extras.sent_to_zone ? [actionResult.extras.sent_to_zone] : []);
        for (const sentCard of sentCards) {
          const dbZone = sentCard.destination === 'field' ? 'field_knight' : sentCard.destination;
          await CardInPlay.update(
            { zone: dbZone },
            { where: { id: sentCard.card_id, match_id }, transaction: tx }
          );
        }

        await ProcessedActionsRegistry.register(
          action_id, match_id, playerNumber, actionResult.state, 'RESOLVE_SELECTION', tx
        );

        return actionResult.state;
      });

      return { success: true, newState: result };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Error resolviendo selección', code: 'SELECTION_ERROR' };
    }
  }

  /**
   * Enriquece el pending_selection con visible_card_ids para deck search.
   * Se llama DESPUÉS de que el engine setea pending_selection (antes de broadcast).
   */
  static async enrichDeckSelection(
    matchId: string,
    pending: PendingSelection
  ): Promise<string[]> {
    if (pending.zone !== 'deck') return [];

    const where: any = {
      match_id: matchId,
      player_number: pending.player_number,
      zone: 'deck',
    };

    // Ordenar por posición (más bajo primero = tope del mazo)
    let deckCards = await CardInPlay.findAll({
      where,
      include: [{ model: Card, as: 'card', attributes: ['id', 'type'] }],
      order: [['position', 'ASC']],
    });

    // Filtrar por tipo si se especificó
    const filter = pending.filter;
    if (filter?.type) {
      deckCards = deckCards.filter((c: any) => c.card?.type === filter.type);
    }

    // Limitar a top_n si fue especificado
    if (filter?.top_n) {
      deckCards = deckCards.slice(0, filter.top_n);
    }

    return deckCards.map((c: any) => c.id);
  }

  // ── Privados ────────────────────────────────────────────────────────────────

  private static async _validateChoice(
    matchId: string,
    state: GameState,
    pending: PendingSelection,
    chosenCardId: string,
    tx: any,
  ): Promise<void> {
    // Validación universal: si hay opciones visibles restringidas, la carta debe estar en la lista.
    // Aplica a cualquier zona (deck con top_n, mano con filtro, yomotsu filtrado, etc.)
    if (pending.visible_card_ids && pending.visible_card_ids.length > 0) {
      if (!pending.visible_card_ids.includes(chosenCardId)) {
        throw new Error('La carta elegida no está entre las opciones disponibles');
      }
    }

    if (pending.zone === 'yomotsu') {
      const player = pending.player_number === 1 ? state.player1 : state.player2;
      const inGraveyard = (player.graveyard ?? []).some(c => c.instance_id === chosenCardId);
      if (!inGraveyard) throw new Error('La carta elegida no está en el yomotsu');

      // Verificar filtro de tipo si existe
      if (pending.filter?.type) {
        const card = (player.graveyard ?? []).find(c => c.instance_id === chosenCardId);
        if (card && card.card_type !== pending.filter.type) {
          throw new Error(`La carta elegida no es de tipo "${pending.filter.type}"`);
        }
      }
    } else if (pending.zone === 'deck') {
      // Para deck search: verificar en BD
      const card = await CardInPlay.findOne({
        where: { id: chosenCardId, match_id: matchId, zone: 'deck',
                 player_number: pending.player_number },
        transaction: tx,
      });
      if (!card) throw new Error('La carta elegida no está en tu mazo');
    } else if (pending.zone === 'hand') {
      // Descarte desde mano: verificar que la carta esté en la mano del jugador
      const player = pending.player_number === 1 ? state.player1 : state.player2;
      const inHand = (player.hand ?? []).some(c => c.instance_id === chosenCardId);
      if (!inHand) throw new Error('La carta elegida no está en tu mano');

      // Verificar filtro de tipo si existe
      if (pending.filter?.type) {
        const card = (player.hand ?? []).find(c => c.instance_id === chosenCardId);
        if (card && card.card_type !== pending.filter.type) {
          throw new Error(`La carta elegida no es de tipo "${pending.filter.type}"`);
        }
      }
    }
  }

  private static async _shuffleDeck(
    matchId: string,
    playerNumber: number,
    tx: any,
    rng: () => number,
  ): Promise<void> {
    const deckCards = await CardInPlay.findAll({
      where: { match_id: matchId, player_number: playerNumber, zone: 'deck' },
      attributes: ['id'],
      transaction: tx,
    });
    if (deckCards.length === 0) return;

    // Fisher-Yates shuffle determinístico usando el RNG inyectado
    const positions = deckCards.map((_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Batch update: una sola query en vez de N queries
    const bindings: any[] = [matchId, playerNumber,
      ...deckCards.flatMap((card: any, i: number) => [card.id, positions[i]]),
    ];
    const valueRows = deckCards.map((_: any, i: number) => {
      const idIdx  = 3 + i * 2;
      const posIdx = 4 + i * 2;
      return `($${idIdx}::uuid, $${posIdx}::int)`;
    });

    await sequelize.query(
      `UPDATE cards_in_play AS c
       SET position = v.pos
       FROM (VALUES ${valueRows.join(', ')}) AS v(card_id, pos)
       WHERE c.id = v.card_id
         AND c.match_id = $1::uuid
         AND c.player_number = $2::int
         AND c.zone = 'deck'`,
      { bind: bindings, type: QueryTypes.BULKUPDATE, transaction: tx },
    );

    console.log(`🔀 [SelectionService] Mazo del jugador ${playerNumber} mezclado (${deckCards.length} cartas)`);
  }

  /**
   * Crea un RNG determinístico seeded con un string (hash FNV-1a → mulberry32).
   * Usar en lugar de Math.random para garantizar reproducibilidad en tests y replay.
   */
  private static _createSeededRng(seed: string): () => number {
    // FNV-1a 32-bit hash
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) | 0;
    }
    // mulberry32 PRNG
    let s = h;
    return function (): number {
      s |= 0;
      s = s + 0x6d2b79f5 | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    };
  }

  private static _mapCardToState(card: any): any {
    const cardData = card.get ? card.get('card') : card.card;
    const knight = cardData?.card_knight;
    const effects = parseStatusEffects(card.status_effects);
    const base_ce = card.current_attack ?? knight?.attack ?? 0;
    const base_ar = card.current_defense ?? knight?.defense ?? 0;

    const raw_abilities: any[] = [];
    for (const ability of cardData?.card_abilities ?? []) {
      try {
        const def = typeof ability.effects === 'string'
          ? JSON.parse(ability.effects)
          : ability.effects;
        if (def) raw_abilities.push({ ability_key: ability.ability_key ?? null, type: ability.type, effects: def });
      } catch { /* skip malformed */ }
    }

    return {
      instance_id: card.id,
      card_id: card.card_id,
      card_type: cardData?.type || 'unknown',
      player_number: card.player_number as 1 | 2,
      zone: card.zone,
      position: card.position,
      mode: deriveModeFromEffects(effects),
      is_exhausted: card.has_attacked_this_turn ?? false,
      attacked_this_turn: card.has_attacked_this_turn ?? false,
      status_effects: effects,
      card_code: cardData?.code ?? '',
      raw_abilities,
      base_ce,
      base_ar,
      ce: base_ce + computeCeBonus(effects),
      ar: base_ar + computeArBonus(effects),
      current_health: card.current_health ?? 0,
      max_health: knight?.health ?? card.current_health ?? 0,
      current_cosmos: card.current_cosmos ?? 0,
    };
  }
}
