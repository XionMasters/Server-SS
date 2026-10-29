/**
 * ActionRegistry.ts
 *
 * Ejecutores de acciones declarativas.
 * El motor no conoce cartas — opera sobre GameState genérico.
 *
 * Acciones disponibles:
 *   apply_status    → aplica/refresca un StatusEffect en los targets resueltos
 *   coin_flip_then  → lanza una moneda; ejecuta heads[]/on_heads[] si cara, tails[]/on_fail[] si cruz
 *   modify_stat     → modifica permanentemente attack/defense/cosmos/health
 *   heal_player     → cura LP de un jugador
 *   (ver cada entrada del registro para el resto)
 *
 * Las acciones con target aceptan `filter` ({ type, code, tag, health_max, status })
 * para restringir los targets resueltos (ej: all_allies con tag 'general').
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
import { normalizeCardType } from '../CardTypes';
import {
  addOrRefreshEffect, removeEffect, computeCeBonus, computeArBonus, deriveModeFromEffects,
  isModeEffectType, type StatusEffectType,
} from '../StatusEffects';
import { createEvent, type GameEvent } from '../events/GameEvents';
import type { GameEventBus } from '../events/GameEventBus';
import type { EngineContext } from '../EngineContext';
import { SeededRNG } from '../combat/RNG';
import { TargetResolver, type TargetContext } from '../targets/TargetResolver';
import { applyDamage } from './DamageAction';
import { heal } from './HealAction';
import { killKnight } from './KillAction';
import { summonKnight } from './SummonAction';

export interface ActionContext {
  playerNumber: 1 | 2;
  sourceCardId: string;
  event: GameEvent;
  /** Fuente de aleatoriedad seeded por el estado de la partida. */
  rng: () => number;
  /**
   * Bus de eventos del contexto de ejecución actual.
   * Requerido para acciones que emiten eventos (apply_damage, heal, etc.).
   * Opcional para compatibilidad con callers que aún no tienen bus.
   */
  bus?: GameEventBus;
  /** Contexto compartido para mantener estado y RNG en efectos encadenados. */
  engineContext?: EngineContext;
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

type CardMoveOrigin = 'graveyard' | 'passive_watchers' | 'hand' | 'field_knight' | 'field_technique' | 'field_helper' | 'field_occasion' | 'field_scenario';

function getEngineContext(ctx: ActionContext, state: GameState): EngineContext {
  if (!ctx.bus) {
    throw new Error('[ActionRegistry] Esta acción requiere un GameEventBus');
  }

  return ctx.engineContext ?? {
    state,
    bus: ctx.bus,
    rng: new SeededRNG(state.rng_seed),
  };
}

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

  // Escenario compartido: pertenece al jugador que lo jugó
  if (state.scenario?.instance_id === cardId) {
    const card = state.scenario;
    state.scenario = null;
    const player = card.player_number === 1 ? state.player1 : state.player2;
    return { card, player, from: 'field_scenario' };
  }

  return null;
}

function _sendCardToHand(player: any, card: any): void {
  // Una carta que vuelve a la mano pierde los efectos que tenía en juego
  card.status_effects = [];
  card.is_exhausted = false;
  card.attacked_this_turn = false;
  if (card.card_type === 'knight' && card.max_health) card.current_health = card.max_health;
  card.zone = 'hand';
  card.position = player.hand.length;
  player.hand.push(card);
}

function _sendCardToCositos(player: any, card: any): void {
  card.zone = 'cositos';
  player.costos_count += 1;
}

function _sendCardToYomotsu(player: any, card: any): void {
  card.zone = 'yomotsu';
  if (!Array.isArray(player.graveyard)) player.graveyard = [];
  player.graveyard.push(card);
  player.graveyard_count = player.graveyard.length;
}

function _targetContext(ctx: ActionContext, result: ActionResult): TargetContext {
  return {
    state: result.state,
    playerNumber: ctx.playerNumber,
    sourceCardId: ctx.sourceCardId,
    event: ctx.event,
    rng: ctx.rng,
    selectedCardId: ctx.selectedCardId,
  };
}

/**
 * Filtro declarativo común a targets y selecciones.
 * Estructura: { type?, code?, tag?: string | string[], health_max?, status? }
 * Si la carta tiene varios tags, basta con que coincida uno.
 */
export function matchesCardFilter(card: any, filter: any): boolean {
  if (!filter) return true;
  if (filter.type) {
    const wanted = (Array.isArray(filter.type) ? filter.type : [filter.type]).map(normalizeCardType);
    if (!wanted.includes(card.card_type)) return false;
  }
  if (filter.code && card.card_code !== filter.code) return false;
  if (filter.tag) {
    const tags: string[] = Array.isArray(filter.tag) ? filter.tag : [filter.tag];
    if (!Array.isArray(card.tags) || !tags.some(t => card.tags.includes(t))) return false;
  }
  if (typeof filter.health_max === 'number' && (card.current_health ?? 0) > filter.health_max) return false;
  if (filter.status && !(card.status_effects ?? []).some((e: any) => e.type === filter.status)) return false;
  return true;
}

/** Resuelve el target declarado y aplica `action.filter` si existe. */
function _resolveTargets(action: any, ctx: ActionContext, result: ActionResult, fallback: string): any[] {
  const targets = TargetResolver.resolve(action.target ?? fallback, _targetContext(ctx, result));
  return action.filter ? targets.filter(c => matchesCardFilter(c, action.filter)) : targets;
}

/** Recalcula ce/ar/mode desde base + status_effects tras modificar efectos. */
function _recomputeDerived(card: any): void {
  if (typeof card.base_ce === 'number') card.ce = card.base_ce + computeCeBonus(card.status_effects ?? []);
  if (typeof card.base_ar === 'number') card.ar = Math.max(0, card.base_ar + computeArBonus(card.status_effects ?? []));
  card.mode = deriveModeFromEffects(card.status_effects ?? []);
}

const ACTION_REGISTRY: Record<string, ActionFn<any>> = {
  // Aplica un StatusEffect a los targets resueltos.
  // Stacking: si el mismo tipo+source ya existe, refresca duración/valor en lugar de duplicar.
  apply_status: (action: ApplyStatusAction, ctx, result) => {
    if (!action.status) {
      throw new Error(`[ActionRegistry] apply_status: falta el campo "status" en la definición`);
    }

    const targets = _resolveTargets(action, ctx, result, 'self');

    for (const card of targets) {
      let statusEffects: any[] = card.status_effects ?? [];

      // Los modos de combate son excluyentes: aplicar uno reemplaza al anterior.
      if (isModeEffectType(action.status as StatusEffectType)) {
        statusEffects = statusEffects.filter((s: any) => !isModeEffectType(s.type));
        card.status_effects = statusEffects;
      }

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

      _recomputeDerived(card);

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
    // Copia: applyDamage puede sacar cartas de field_knights mientras iteramos.
    const targets = [..._resolveTargets(action, ctx, result, 'target')];
    const engineCtx = getEngineContext(ctx, result.state);
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
    const targets = [..._resolveTargets(action, ctx, result, 'target')];
    const engineCtx = getEngineContext(ctx, result.state);
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
    const targets = _resolveTargets(action, ctx, result, 'self');
    const engineCtx = getEngineContext(ctx, result.state);
    for (const card of targets) {
      heal(engineCtx, card.instance_id, action.amount ?? 0, ctx.sourceCardId);
      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Restaura CP (Cosmos Points) a los targets resueltos.
   * Opuesto de apply_cosmos_damage para carta — no tiene tope ya que max_cosmos no está en
   * GameState; el exceso simplemente queda como reserva hasta que se use.
   * Un amount negativo drena CP (sin bajar de 0).
   * Estructura: { type: 'restore_cosmos', target: TargetType, amount: number, filter? }
   */
  restore_cosmos: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 0;
    const targets = _resolveTargets(action, ctx, result, 'self');
    for (const card of targets) {
      (card as any).current_cosmos = Math.max(0, ((card as any).current_cosmos ?? 0) + amount);
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
    const engineCtx = getEngineContext(ctx, result.state);
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
   * Solicita al jugador que elija una carta de una zona (yomotsu, deck, mano, campo, etc.).
   * Detiene la cadena de acciones (stop_chain) y setea state.pending_selection.
   * El jugador responde con resolve_selection → el servicio ejecuta on_select.
   *
   * Estructura:
   *   { type: 'request_selection', zone: 'yomotsu'|'deck'|'field'|...,
   *     filter?: { type?, top_n?, code? }, destination: 'hand'|'field'|'cositos',
   *     on_select: ActionDefinition[] }
   *
   * Para zone === 'field': visible_card_ids se puebla aquí directamente desde el
   * GameState (los caballeros ya están en memoria), filtrando por filter.type y filter.code.
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
      visible_card_ids: undefined, // El servicio lo rellena para deck search; aquí para field
    };

    // Zonas que ya están en GameState → poblar visible_card_ids aquí.
    //   field                  → caballeros propios
    //   field_opponent         → caballeros rivales
    //   field_support_opponent → objeto/ocasión rival + escenario activo
    //   yomotsu                → yomotsu propio
    const player   = ctx.playerNumber === 1 ? result.state.player1 : result.state.player2;
    const opponent = ctx.playerNumber === 1 ? result.state.player2 : result.state.player1;
    let candidates: any[] | null = null;
    if (action.zone === 'field') candidates = player.field_knights;
    if (action.zone === 'field_opponent') candidates = opponent.field_knights;
    if (action.zone === 'field_support_opponent') {
      candidates = [
        ...(opponent.field_occasion ? [opponent.field_occasion] : []),
        ...(result.state.scenario ? [result.state.scenario] : []),
      ];
    }
    if (action.zone === 'yomotsu') candidates = player.graveyard ?? [];

    if (candidates) {
      const visible = candidates.filter((c: any) => matchesCardFilter(c, action.filter));
      result.state.pending_selection.visible_card_ids = visible.map((c: any) => c.instance_id);

      // Sin opciones válidas: no bloquear la partida esperando una selección imposible.
      if (visible.length === 0) {
        result.state.pending_selection = null;
        result.extras.selection_skipped = true;
        result.extras.stop_chain = true;
        return;
      }
    }

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
    const targets = [..._resolveTargets(action, ctx, result, 'selected')];
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
        const engineCtx = getEngineContext(ctx, result.state);
        summonKnight(engineCtx, cardId, action.position ?? 0, inferredFromZone);
      } else {
        const detached = _detachCardFromKnownZones(result.state, cardId);
        if (!detached) continue;
        if (destination === 'hand') {
          _sendCardToHand(detached.player, detached.card);
        } else if (destination === 'cositos') {
          _sendCardToCositos(detached.player, detached.card);
        } else if (destination === 'yomotsu') {
          _sendCardToYomotsu(detached.player, detached.card);
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
   * El engine decrementa deck_count, emite los eventos y anota el robo en
   * state.pending_draws; MatchRepository.applyState mueve las cartas en BD.
   * Estructura: { type: 'draw_card', amount: N, player?: 'self' | 'opponent' }
   */
  draw_card: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 1;
    const drawerNumber: 1 | 2 = action.player === 'opponent'
      ? (ctx.playerNumber === 1 ? 2 : 1)
      : ctx.playerNumber;
    const player = drawerNumber === 1 ? result.state.player1 : result.state.player2;
    if (!result.state.pending_draws) result.state.pending_draws = { 1: 0, 2: 0 };

    for (let i = 0; i < amount; i++) {
      if (player.deck_count <= 0) break;
      player.deck_count -= 1;
      result.state.pending_draws[drawerNumber] += 1;
      const remaining = player.deck_count;
      if (ctx.bus) {
        ctx.bus.emit(createEvent({ type: 'ALLY_DREW_CARD', playerNumber: drawerNumber,
          origin: 'system', payload: { cardId: '', remainingDeck: remaining } }));
        ctx.bus.emit(createEvent({ type: 'OPPONENT_DREW_CARD', playerNumber: drawerNumber,
          origin: 'system', payload: { remainingDeck: remaining } }));
      }
    }
    result.extras.draw_card_count = (result.extras.draw_card_count ?? 0) + amount;
    if (!result.extras.draw_card_player) {
      result.extras.draw_card_player = drawerNumber;
    }
  },

  /**
   * Transforma una carta en campo en otra forma (ej: Shun → Virgo Shun).
   * Actualiza todos los stats de combate (CE, AR, HP, CP) en el GameState in-memory.
   * Limpia status_effects de la forma anterior.
   * El servicio debe actualizar el card_id en BD leyendo extras.transforms.
   *
   * Estructura:
   *   {
   *     type: 'transform',
   *     target: 'selected' | TargetType,
   *     into: {
   *       "<source_card_code>": { code: "<target_card_code>", ce: N, ar: N, health: N, cosmos: N },
   *       ...
   *     }
   *   }
   *
   * El mapa `into` usa el card_code de la carta fuente para determinar la forma destino,
   * permitiendo que una sola acción cubra múltiples versiones del mismo personaje.
   *
   * Para añadir al catálogo: actualizar src/views/admin.html → sección "🎯 Actions".
   */
  transform: (action: any, ctx, result) => {
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'selected', targetCtx);
    if (targets.length === 0) {
      console.warn('[ActionRegistry] transform: no se encontró el objetivo de la transformación');
      return;
    }

    const into: Record<string, { code: string; ce: number; ar: number; health: number; cosmos: number }> =
      action.into ?? {};

    for (const card of targets) {
      const sourceCode: string = (card as any).card_code ?? '';
      const mapping = into[sourceCode];

      if (!mapping) {
        console.warn(`[ActionRegistry] transform: no hay definición para card_code "${sourceCode}"`);
        continue;
      }

      // Actualizar stats in-memory
      card.ce       = mapping.ce;
      card.ar       = mapping.ar;
      card.base_ce  = mapping.ce;
      card.base_ar  = mapping.ar;
      card.current_health = mapping.health;
      card.max_health     = mapping.health;
      card.current_cosmos = mapping.cosmos;
      (card as any).card_code = mapping.code;
      // Limpiar status effects de la forma anterior
      card.status_effects = [];

      // Registrar para que el servicio actualice el card_id en BD
      if (!Array.isArray(result.extras.transforms)) result.extras.transforms = [];
      (result.extras.transforms as any[]).push({
        instance_id: card.instance_id,
        into_code: mapping.code,
      });

      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Aplica ce_boost a self igual a la AR del caballero oponente con mayor armadura.
   * Si el oponente no tiene caballeros en campo, no hace nada.
   * Usado por "Hidden Cosmo" de Shun v2.
   * Estructura: { type: 'ce_boost_from_opponent_max_ar' }
   */
  ce_boost_from_opponent_max_ar: (action: any, ctx, result) => {
    const opponent = ctx.playerNumber === 1 ? result.state.player2 : result.state.player1;
    if (opponent.field_knights.length === 0) return;

    const maxAr = Math.max(...opponent.field_knights.map((c: any) => c.ar ?? 0));
    if (maxAr <= 0) return;

    const selfPlayer = ctx.playerNumber === 1 ? result.state.player1 : result.state.player2;
    const selfCard = selfPlayer.field_knights.find((c: any) => c.instance_id === ctx.sourceCardId)
      ?? (selfPlayer.passive_watchers ?? []).find((c: any) => c.instance_id === ctx.sourceCardId);
    if (!selfCard) return;

    selfCard.status_effects = addOrRefreshEffect(selfCard.status_effects ?? [], {
      type: 'ce_boost' as StatusEffectType,
      value: maxAr,
      remaining_turns: null,
      source: { card_instance_id: ctx.sourceCardId, player: ctx.playerNumber, type: 'passive' },
    });
    selfCard.ce = selfCard.base_ce + computeCeBonus(selfCard.status_effects);

    result.affectedIds.push(selfCard.instance_id);
  },

  /**
   * Transfiere el AR actual de la carta a su CE (Eject Armor — Shiryu).
   * Pone el AR a 0 permanentemente y agrega el mismo valor como ce_boost permanente.
   * Actualiza los campos base_ar, ar, ce de forma inmediata.
   * Estructura: { type: 'transfer_ar_to_ce', target: TargetType }
   */
  transfer_ar_to_ce: (action: any, ctx, result) => {
    const targetCtx: TargetContext = {
      state: result.state,
      playerNumber: ctx.playerNumber,
      sourceCardId: ctx.sourceCardId,
      event: ctx.event,
      rng: ctx.rng,
      selectedCardId: ctx.selectedCardId,
    };
    const targets = TargetResolver.resolve(action.target ?? 'self', targetCtx);
    for (const target of targets) {
      const arAmount = Math.max(0, target.ar ?? 0);
      if (arAmount === 0) continue;

      // Poner AR base a 0 permanentemente
      target.base_ar = 0;
      target.ar = 0;

      // Limpiar ar_boost positivos existentes (ya incorporados en arAmount)
      target.status_effects = (target.status_effects ?? []).filter(
        (e: any) => !(e.type === 'ar_boost' && (e.value ?? 0) > 0)
      ) as typeof target.status_effects;

      // Agregar ce_boost permanente por el valor transferido
      target.status_effects = addOrRefreshEffect(target.status_effects ?? [], {
        type: 'ce_boost' as StatusEffectType,
        value: arAmount,
        remaining_turns: null,
        source: { card_instance_id: `${ctx.sourceCardId}_transfer`, player: ctx.playerNumber, type: 'passive' },
      });

      // Actualizar CE efectivo inmediatamente
      target.ce = target.base_ce + computeCeBonus(target.status_effects);

      result.affectedIds.push(target.instance_id);
    }
  },

  /**
   * Reduce permanentemente el AR base de los targets resueltos en 'amount' puntos.
   * A diferencia de ar_boost (temporal), este cambio modifica base_ar directamente.
   * Usado por habilidades como "Fissure Point" de Hyoga.
   * Estructura: { type: 'permanent_ar_reduce', target: TargetType, amount: number }
   */
  permanent_ar_reduce: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 0;
    if (amount <= 0) return;
    const targets = _resolveTargets(action, ctx, result, 'target');
    for (const target of targets) {
      target.base_ar = Math.max(0, (target.base_ar ?? 0) - amount);
      target.ar      = Math.max(0, target.base_ar + computeArBonus(target.status_effects ?? []));
      result.affectedIds.push(target.instance_id);
    }
  },

  /**
   * El oponente descarta cartas aleatorias de su mano al yomotsu.
   * MatchRepository.applyState persiste la zona de las cartas del graveyard.
   * Estructura: { type: 'discard_opponent_random', amount: number }
   */
  discard_opponent_random: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 1;
    const opponentNumber: 1 | 2 = ctx.playerNumber === 1 ? 2 : 1;
    const opponent = opponentNumber === 1 ? result.state.player1 : result.state.player2;
    if (!Array.isArray(result.extras.discard_opponent_random)) {
      result.extras.discard_opponent_random = [];
    }

    for (let i = 0; i < amount && opponent.hand.length > 0; i++) {
      const idx = Math.floor(ctx.rng() * opponent.hand.length);
      const [card] = opponent.hand.splice(idx, 1);
      _sendCardToYomotsu(opponent, card);
      result.affectedIds.push(card.instance_id);
      (result.extras.discard_opponent_random as any[]).push({ player: opponentNumber, card_id: card.instance_id });
    }
    opponent.hand.forEach((c: any, i: number) => { c.position = i; });
  },

  /**
   * Modifica un stat de los targets de forma permanente.
   *   attack  → base_ce        defense → base_ar
   *   cosmos  → current_cosmos health  → current_health y max_health
   * Estructura: { type: 'modify_stat', stat, amount, target?, filter? }
   */
  modify_stat: (action: any, ctx, result) => {
    const amount: number = action.amount ?? 0;
    if (amount === 0) return;
    const targets = _resolveTargets(action, ctx, result, 'self');
    for (const card of targets) {
      switch (action.stat) {
        case 'attack':
          card.base_ce = Math.max(0, (card.base_ce ?? 0) + amount);
          break;
        case 'defense':
          card.base_ar = Math.max(0, (card.base_ar ?? 0) + amount);
          break;
        case 'cosmos':
          card.current_cosmos = Math.max(0, (card.current_cosmos ?? 0) + amount);
          break;
        case 'health':
          card.max_health = Math.max(1, (card.max_health ?? 0) + amount);
          card.current_health = Math.min(card.max_health, Math.max(1, (card.current_health ?? 0) + amount));
          break;
        default:
          throw new Error(`[ActionRegistry] modify_stat: stat desconocido "${action.stat}"`);
      }
      _recomputeDerived(card);
      result.affectedIds.push(card.instance_id);
    }
  },

  /**
   * Cura LP de un jugador.
   * Estructura: { type: 'heal_player', target: 'self'|'opponent', amount: number }
   */
  heal_player: (action: any, ctx, result) => {
    const amount: number = Math.max(0, action.amount ?? 0);
    const targetPlayerNumber: 1 | 2 = action.target === 'opponent'
      ? (ctx.playerNumber === 1 ? 2 : 1)
      : ctx.playerNumber;
    const targetPlayer = targetPlayerNumber === 1 ? result.state.player1 : result.state.player2;
    targetPlayer.life += amount;
    if (!Array.isArray(result.extras.player_heal_applied)) result.extras.player_heal_applied = [];
    (result.extras.player_heal_applied as any[]).push({ target_player: targetPlayerNumber, amount });
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
