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
        const fakeEvent = createEvent({
          type: 'CARD_PLAYED',
          playerNumber,
          sourceCardId: pending.source_card_id,
          origin: 'player',
          payload: { zone: 'yomotsu', position: 0 },
        });

        const actionCtx: ActionContext = {
          playerNumber,
          sourceCardId: pending.source_card_id,
          event: fakeEvent,
          rng: Math.random.bind(Math),
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
            await this._shuffleDeck(match_id, pNum, tx);
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

        // 11. Si la carta elegida era del mazo, actualizar su zona en BD
        // 11. Sincronizar zona en BD para cartas movidas desde deck o hand
        const sentCard = actionResult.extras.sent_to_zone;
        if (sentCard && (pending.zone === 'deck' || pending.zone === 'hand')) {
          const dbZone = sentCard.destination === 'field' ? 'field_knight' : sentCard.destination;
          await CardInPlay.update(
            { zone: dbZone },
            { where: { id: chosen_card_id, match_id }, transaction: tx }
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

      // Si hay visible_card_ids (top_n o tipo filtrado): validar que esté en la lista
      if (pending.visible_card_ids && pending.visible_card_ids.length > 0) {
        if (!pending.visible_card_ids.includes(chosenCardId)) {
          throw new Error('La carta elegida no está entre las opciones disponibles');
        }
      }
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

  private static async _shuffleDeck(matchId: string, playerNumber: number, tx: any): Promise<void> {
    const deckCards = await CardInPlay.findAll({
      where: { match_id: matchId, player_number: playerNumber, zone: 'deck' },
      transaction: tx,
    });

    if (deckCards.length === 0) return;

    // Fisher-Yates shuffle sobre los índices de posición
    const positions = deckCards.map((_, i) => i);
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    for (let i = 0; i < deckCards.length; i++) {
      await (deckCards[i] as any).update(
        { position: positions[i] },
        { transaction: tx }
      );
    }

    console.log(`🔀 [SelectionService] Mazo del jugador ${playerNumber} mezclado (${deckCards.length} cartas)`);
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
      current_cosmos: card.current_cosmos ?? 0,
    };
  }
}
