/**
 * ActionRegistry.ts
 *
 * Ejecutores de acciones declarativas.
 * El motor no conoce cartas — opera sobre GameState genérico.
 *
 * Acciones disponibles:
 *   apply_status    → aplica/refresca un StatusEffect en los targets resueltos
 *   coin_flip_then  → lanza una moneda; ejecuta heads[]/on_heads[] si cara, tails[]/on_fail[] si cruz
 *
 * Regla de stacking de apply_status:
 *   Si ya existe un efecto del mismo tipo con el mismo source en la carta,
 *   se refresca la duración/valor en lugar de duplicarlo ("refresh, not stack").
 *   Efectos de distinto source sí se acumulan (ej: dos Ikkis quemando al mismo rival).
 *
 * Para añadir una nueva acción:
 *   Crea src/engine/actions/MiAccion.ts con la función, luego:
 *   ActionRegistry.register('mi_accion', MiAccionFn);
 *   ⚠️  Actualizar también el catálogo en src/views/admin.html → sección "🎯 Actions".
 */

import { resolveWinCondition, type GameState } from '../GameState';

/**
 * Interacciones declarativas entre efectos de estado.
 * - blockedBy: si la carta ya tiene alguno de estos efectos, la aplicación se cancela.
 * - removes:   al aplicar este efecto, remueve los efectos listados de la carta objetivo.
 *
 * Para añadir una relación nueva basta con editar este mapa — sin tocar código del engine.
 */
const STATUS_INTERACTIONS: Record<string, { blockedBy?: string[]; removes?: string[] }> = {
  burn:          { blockedBy: ['burn_immune'] },
  poison:        { blockedBy: ['poison_immune'] },
  burn_immune:   { removes: ['burn'] },
  poison_immune: { removes: ['poison'] },
};
import type { ActionDefinition, ApplyStatusAction, CoinFlipAction, KillAction } from '../abilities/AbilityDefinition';
import { addOrRefreshEffect, removeEffect, type StatusEffectType } from '../StatusEffects';
import { createEvent, type GameEvent } from '../events/GameEvents';
import type { GameEventBus } from '../events/GameEventBus';
import { TargetResolver, type TargetContext } from '../targets/TargetResolver';
import { applyDamage } from './DamageAction';
import { heal } from './HealAction';
import { killKnight } from './KillAction';
import { summonKnight } from './SummonAction';

export interface ActionContext {
  playerNumber: 1 | 2;
  sourceCardId: string;
  event: GameEvent;
  /** Fuente de aleatoriedad inyectable (facilita tests). Por defecto: Math.random. */
  rng: () => number;
  /**
   * Bus de eventos del contexto de ejecución actual.
   * Requerido para acciones que emiten eventos (apply_damage, heal, etc.).
   * Opcional para compatibilidad con callers que aún no tienen bus.
   */
  bus?: GameEventBus;
  /**
   * ID de la carta elegida en una selección interactiva (resolve_selection).
   * Presente solo cuando se ejecutan acciones `on_select` de un `request_selection`.
   * Resuelve el target especial 'selected' en TargetResolver.
   */
  selectedCardId?: string;
}

export interface ActionResult {
  state: GameState;
  affectedIds: string[];
  /** Datos adicionales que el servicio necesita (discard_card_id, coin_flip_result, etc.). */
  extras: Record<string, any>;
}

type ActionFn<T extends ActionDefinition = ActionDefinition> = (
  action: T,
  ctx: ActionContext,
  result: ActionResult,
) => void;

type CardMoveOrigin = 'graveyard' | 'passive_watchers' | 'hand' | 'field_knight' | 'field_technique' | 'field_helper' | 'field_occasion';

function _detachCardFromKnownZones(
  state: GameState,
  cardId: string,
): { card: any; player: any; from: CardMoveOrigin } | null {
  for (const player of [state.player1, state.player2]) {
    if (!Array.isArray(player.graveyard)) player.graveyard = [];

    const graveIdx = player.graveyard.findIndex((c: any) => c.instance_id === cardId);
    if (graveIdx !== -1) {
      const card = player.graveyard.splice(graveIdx, 1)[0];
      const pwIdx = player.passive_watchers.findIndex((c: any) => c.instance_id === cardId);
      if (pwIdx !== -1) player.passive_watchers.splice(pwIdx, 1);
      player.graveyard_count = player.graveyard.length;
      return { card, player, from: 'graveyard' };
    }

    const pwIdx = player.passive_watchers.findIndex((c: any) => c.instance_id === cardId);
    if (pwIdx !== -1) {
      const card = player.passive_watchers.splice(pwIdx, 1)[0];
      return { card, player, from: 'passive_watchers' };
    }

    const handIdx = player.hand.findIndex((c: any) => c.instance_id === cardId);
    if (handIdx !== -1) {
      const card = player.hand.splice(handIdx, 1)[0];
      return { card, player, from: 'hand' };
    }

    const fkIdx = player.field_knights.findIndex((c: any) => c.instance_id === cardId);
    if (fkIdx !== -1) {
      const card = player.field_knights.splice(fkIdx, 1)[0];
      return { card, player, from: 'field_knight' };
    }

    const ftIdx = player.field_techniques.findIndex((c: any) => c.instance_id === cardId);
    if (ftIdx !== -1) {
      const card = player.field_techniques.splice(ftIdx, 1)[0];
      return { card, player, from: 'field_technique' };
    }

    if (player.field_helper?.instance_id === cardId) {
      const card = player.field_helper;
      player.field_helper = null;
      return { card, player, from: 'field_helper' };
    }

    if (player.field_occasion?.instance_id === cardId) {
      const card = player.field_occasion;
      player.field_occasion = null;
      return { card, player, from: 'field_occasion' };
    }
  }

  return null;
}

function _sendCardToHand(player: any, card: any): void {
  card.zone = 'hand';
  card.position = player.hand.length;
  player.hand.push(card);
}

function _sendCardToCositos(player: any, card: any): void {
  card.zone = 'cositos';
  player.costos_count += 1;
}

const ACTION_REGISTRY: Record<string, ActionFn<any>> = {
  // Aplica un StatusEffect a los targets resueltos.
  // Stacking: si el mismo tipo+source ya existe, refresca duración/valor en lugar de duplicar.
  apply_status: (action: ApplyStatusAction, ctx, result) => {
    if (!action.status) {
      throw new Error(`[ActionRegistry] apply_status: falta el campo "status" en la definición`);
    }

    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'self', targetCtx);

    for (const card of targets) {
      let statusEffects: any[] = card.status_effects ?? [];

      const interaction = STATUS_INTERACTIONS[action.status];

      // Si la carta ya tiene uno de los efectos bloqueadores → ignorar la aplicación.
      if (interaction?.blockedBy?.some((blocker) => statusEffects.some((s: any) => s.type === blocker))) {
        continue;
      }

      // Remover efectos que este status cancela (ej: burn_immune quita burn).
      if (interaction?.removes) {
        for (const toRemove of interaction.removes) {
          statusEffects = removeEffect(statusEffects as any, toRemove as StatusEffectType) as any[];
        }
        card.status_effects = statusEffects;
      }

      const existing = statusEffects.find(
        (s: any) => s.type === action.status && s.source?.card_instance_id === ctx.sourceCardId,
      );

      if (existing) {
        card.status_effects = addOrRefreshEffect(statusEffects as any, {
          type: action.status as StatusEffectType,
          remaining_turns: action.duration ?? existing.remaining_turns ?? null,
          ...(action.value !== undefined ? { value: action.value } : {}),
          source: {
            card_instance_id: ctx.sourceCardId,
            player: ctx.playerNumber,
            type: 'passive',
          },
        } as any);
      } else {
        card.status_effects = addOrRefreshEffect(statusEffects as any, {
          type: action.status as StatusEffectType,
          remaining_turns: action.duration ?? null,
          ...(action.value !== undefined ? { value: action.value } : {}),
          source: {
            card_instance_id: ctx.sourceCardId,
            player: ctx.playerNumber,
            type: 'passive',
          },
        } as any);
      }

      // Deduplicar más tarde con Set en AbilityEngine.execute
      result.affectedIds.push(card.instance_id);

      // Acumular por array para soportar múltiples targets en la misma acción
      if (!Array.isArray(result.extras.status_applied)) result.extras.status_applied = [];
      (result.extras.status_applied as any[]).push({
        status: action.status,
        target: card.instance_id,
      });
    }
  },

  /**
   * Aplica daño a los targets resueltos.
   * Requiere ctx.bus para propagar DAMAGE_DEALT / DAMAGE_LETHAL / KNIGHT_DIED.
   * Estructura: { type: 'apply_damage', target: TargetType, amount: number }
   */
  apply_damage: (action: any, ctx, result) => {
    if (!ctx.bus) {
      throw new Error('[ActionRegistry] apply_damage requiere un GameEventBus en ctx.bus');
    }
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'target', targetCtx);
    const engineCtx = { state: result.state, bus: ctx.bus };
    for (const card of targets) {
      applyDamage(engineCtx, card.instance_id, action.amount ?? 0, ctx.sourceCardId);
      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Aplica daño directo a un jugador (no a una carta).
   * Estructura: { type: 'apply_player_damage', target: 'self'|'opponent', amount: number }
   */
  apply_player_damage: (action: any, ctx, result) => {
    const amount: number = Math.max(0, action.amount ?? 0);
    const targetPlayerNumber: 1 | 2 = action.target === 'self'
      ? ctx.playerNumber
      : (ctx.playerNumber === 1 ? 2 : 1);

    const targetPlayer = targetPlayerNumber === 1 ? result.state.player1 : result.state.player2;
    targetPlayer.life = Math.max(0, targetPlayer.life - amount);

    resolveWinCondition(result.state);

    if (!Array.isArray(result.extras.player_damage_applied)) {
      result.extras.player_damage_applied = [];
    }
    (result.extras.player_damage_applied as any[]).push({
      target_player: targetPlayerNumber,
      amount,
    });
  },

  /**
   * Aplica daño directo al cosmos del jugador (PCP), sin bajar de 0.
   * Estructura: { type: 'apply_cosmos_damage', target: 'self'|'opponent', amount: number }
   */
  apply_cosmos_damage: (action: any, ctx, result) => {
    const amount: number = Math.max(0, action.amount ?? 0);
    const targetPlayerNumber: 1 | 2 = action.target === 'self'
      ? ctx.playerNumber
      : (ctx.playerNumber === 1 ? 2 : 1);

    const targetPlayer = targetPlayerNumber === 1 ? result.state.player1 : result.state.player2;
    targetPlayer.cosmos = Math.max(0, targetPlayer.cosmos - amount);

    if (!Array.isArray(result.extras.player_cosmos_damage_applied)) {
      result.extras.player_cosmos_damage_applied = [];
    }
    (result.extras.player_cosmos_damage_applied as any[]).push({
      target_player: targetPlayerNumber,
      amount,
    });
  },

  /**
   * Elimina caballeros objetivo (envía a yomotsu y dispara eventos de muerte).
   * Estructura: { type: 'kill', target?: TargetType }
   */
  kill: (action: KillAction, ctx, result) => {
    if (!ctx.bus) {
      throw new Error('[ActionRegistry] kill requiere un GameEventBus en ctx.bus');
    }
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'target', targetCtx);
    const engineCtx = { state: result.state, bus: ctx.bus };
    for (const card of targets) {
      killKnight(engineCtx, card.instance_id, ctx.sourceCardId, 'effect');
      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Cura HP a los targets resueltos.
   * Requiere ctx.bus para propagar HEAL_RECEIVED.
   * Estructura: { type: 'heal', target: TargetType, amount: number }
   */
  heal: (action: any, ctx, result) => {
    if (!ctx.bus) {
      throw new Error('[ActionRegistry] heal requiere un GameEventBus en ctx.bus');
    }
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'self', targetCtx);
    const engineCtx = { state: result.state, bus: ctx.bus };
    for (const card of targets) {
      heal(engineCtx, card.instance_id, action.amount ?? 0, ctx.sourceCardId);
      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Convoca un caballero desde yomotsu/mazo/cositos al campo.
   * La carta debe estar en passive_watchers del estado (puesta ahí por killKnight o el mapper).
   * Requiere ctx.bus para propagar KNIGHT_SUMMONED.
   * Estructura: { type: 'summon_from_zone', zone: 'yomotsu'|'deck'|'cositos', position?: number }
   */
  summon_from_zone: (action: any, ctx, result) => {
    if (!ctx.bus) {
      throw new Error('[ActionRegistry] summon_from_zone requiere un GameEventBus en ctx.bus');
    }
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'self', targetCtx);
    const position = action.position ?? 0;
    const engineCtx = { state: result.state, bus: ctx.bus };
    for (const card of targets) {
      const inferredFromZone = card.zone === 'deck'
        ? 'deck'
        : card.zone === 'cositos'
          ? 'cositos'
          : 'yomotsu';
      const fromZone = action.zone ?? inferredFromZone;
      summonKnight(engineCtx, card.instance_id, position, fromZone);
      result.affectedIds.push(card.instance_id);
    }
  },

  // Coin flip: ejecuta acciones en éxito (cara) o fallo (cruz).
  // Claves soportadas: on_heads / heads (cara),  on_fail / tails (cruz) — ambas equivalentes.
  coin_flip_then: (action: CoinFlipAction, ctx, result) => {
    const isHeads = ctx.rng() < 0.5;
    result.extras.coin_flip_result  = isHeads ? 'heads' : 'tails';
    result.extras.coin_flip_success = isHeads;

    const successActions = action.heads ?? action.on_heads;
    const failActions    = action.tails ?? action.on_fail;

    if (isHeads && Array.isArray(successActions)) {
      ActionRegistry.executeAll(successActions, ctx, result);
    } else if (!isHeads && Array.isArray(failActions)) {
      ActionRegistry.executeAll(failActions, ctx, result);
    }
  },

  /**
   * Solicita al jugador que elija una carta de una zona (yomotsu, deck, mano, etc.).
   * Detiene la cadena de acciones (stop_chain) y setea state.pending_selection.
   * El jugador responde con resolve_selection → el servicio ejecuta on_select.
   *
   * Estructura:
   *   { type: 'request_selection', zone: 'yomotsu'|'deck'|...,
   *     filter?: { type?, top_n? }, destination: 'hand'|'field'|'cositos',
   *     on_select: ActionDefinition[] }
   */
  request_selection: (action: any, ctx, result) => {
    const selectionId = `sel_${Date.now()}_${ctx.rng().toString(36).slice(2, 7)}`;
    result.state.pending_selection = {
      id: selectionId,
      player_number: ctx.playerNumber,
      zone: action.zone,
      filter: action.filter ?? null,
      destination: action.destination ?? 'hand',
      on_select: action.on_select ?? [],
      source_card_id: ctx.sourceCardId,
      source_player: ctx.playerNumber,
      created_at: Date.now(),
      visible_card_ids: undefined, // El servicio lo rellena para deck search
    };
    result.extras.selection_required = true;
    result.extras.selection_id = selectionId;
    result.extras.stop_chain = true; // Detener ejecución de acciones siguientes
  },

  /**
   * Mueve una carta a la zona destino.
   * Para graveyard → field/hand: opera sobre engine state.
   * Para deck → (...): el servicio (SelectionService) maneja la BD directamente.
   *
   * target 'selected' = la carta elegida por el jugador (ctx.selectedCardId).
   * Estructura: { type: 'send_to_zone', target: 'selected', destination: 'hand'|'field'|'cositos' }
   */
  send_to_zone: (action: any, ctx, result) => {
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'selected', targetCtx);
    if (targets.length === 0) return;

    const destination: string = action.destination ?? 'hand';
    if (!Array.isArray(result.extras.sent_to_zone)) result.extras.sent_to_zone = [];

    for (const target of targets) {
      const cardId = target.instance_id;

      if (destination === 'field') {
        if (!ctx.bus) {
          throw new Error('[ActionRegistry] send_to_zone a field requiere un GameEventBus en ctx.bus');
        }
        const inferredFromZone = target.zone === 'deck'
          ? 'deck'
          : target.zone === 'cositos'
            ? 'cositos'
            : 'yomotsu';
        const engineCtx = { state: result.state, bus: ctx.bus };
        summonKnight(engineCtx, cardId, action.position ?? 0, inferredFromZone);
      } else {
        const detached = _detachCardFromKnownZones(result.state, cardId);
        if (!detached) continue;
        if (destination === 'hand') {
          _sendCardToHand(detached.player, detached.card);
        } else if (destination === 'cositos') {
          _sendCardToCositos(detached.player, detached.card);
        }
      }

      result.affectedIds.push(cardId);
      (result.extras.sent_to_zone as any[]).push({ card_id: cardId, destination });
    }
  },

  /**
   * Marca el mazo del jugador indicado para mezclado.
   * El engine solo registra la intención; el servicio ejecuta el shuffle en BD.
   * Estructura: { type: 'shuffle_deck', player: 'self' | 'opponent' }
   */
  shuffle_deck: (action: any, ctx, result) => {
    const targetPlayerNum = action.player === 'opponent'
      ? (ctx.playerNumber === 1 ? 2 : 1)
      : ctx.playerNumber;
    if (!Array.isArray(result.extras.shuffle_deck_players)) {
      result.extras.shuffle_deck_players = [];
    }
    (result.extras.shuffle_deck_players as number[]).push(targetPlayerNum);
  },

  /**
   * Roba cartas del mazo al conjunto de la mano.
   * El engine decrementa deck_count y emite los eventos.
   * El servicio (CardDrawService / SelectionService) ejecuta el movimiento real en BD.
   * Estructura: { type: 'draw_card', amount: N }
   */
  draw_card: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 1;

    for (let i = 0; i < amount; i++) {
      const player = ctx.playerNumber === 1 ? result.state.player1 : result.state.player2;
      if (player.deck_count > 0) {
        player.deck_count -= 1;
      }
      const remaining = player.deck_count;
      if (ctx.bus) {
        ctx.bus.emit(createEvent({ type: 'ALLY_DREW_CARD', playerNumber: ctx.playerNumber,
          origin: 'system', payload: { cardId: '', remainingDeck: remaining } }));
        ctx.bus.emit(createEvent({ type: 'OPPONENT_DREW_CARD', playerNumber: ctx.playerNumber,
          origin: 'system', payload: { remainingDeck: remaining } }));
      }
    }
    // El servicio interpreta esto para mover cartas en BD
    result.extras.draw_card_count = (result.extras.draw_card_count ?? 0) + amount;
    if (!result.extras.draw_card_player) {
      result.extras.draw_card_player = ctx.playerNumber;
    }
  },
};

export const ActionRegistry = {
  execute(action: ActionDefinition, ctx: ActionContext, result: ActionResult): void {
    const fn = ACTION_REGISTRY[action.type];
    if (!fn) throw new Error(`[ActionRegistry] Acción desconocida: "${action.type}"`);
    fn(action, ctx, result);
  },

  executeAll(actions: ActionDefinition[], ctx: ActionContext, result: ActionResult): void {
    for (const action of actions) {
      this.execute(action, ctx, result);
      // request_selection detiene la cadena — esperar respuesta del jugador
      if (result.extras.stop_chain) break;
    }
  },

  register(name: string, fn: ActionFn): void {
    ACTION_REGISTRY[name] = fn;
  },
};
