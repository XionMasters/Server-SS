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
 */

import type { GameState } from '../GameState';
import type { ActionDefinition, ApplyStatusAction, CoinFlipAction } from '../abilities/AbilityDefinition';
import type { StatusEffectType } from '../StatusEffects';
import type { GameEvent } from '../events/GameEvents';
import { TargetResolver, type TargetContext } from '../targets/TargetResolver';

export interface ActionContext {
  playerNumber: 1 | 2;
  sourceCardId: string;
  event: GameEvent;
  /** Fuente de aleatoriedad inyectable (facilita tests). Por defecto: Math.random. */
  rng: () => number;
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
    };
    const targets = TargetResolver.resolve(action.target ?? 'self', targetCtx);

    for (const card of targets) {
      const statusEffects: any[] = card.status_effects ?? [];
      const existing = statusEffects.find(
        (s: any) => s.type === action.status && s.source === ctx.sourceCardId,
      );

      if (existing) {
        // Refrescar: regenerar duración/valor sin duplicar la entrada
        if (action.duration !== undefined) existing.remaining_turns = action.duration;
        if (action.value    !== undefined) existing.value           = action.value;
      } else {
        card.status_effects = [
          ...statusEffects,
          {
            type: action.status as StatusEffectType,
            remaining_turns: action.duration ?? null,
            ...(action.value !== undefined ? { value: action.value } : {}),
            source: ctx.sourceCardId,
          },
        ];
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
};

export const ActionRegistry = {
  execute(action: ActionDefinition, ctx: ActionContext, result: ActionResult): void {
    const fn = ACTION_REGISTRY[action.type];
    if (!fn) throw new Error(`[ActionRegistry] Acción desconocida: "${action.type}"`);
    fn(action, ctx, result);
  },

  executeAll(actions: ActionDefinition[], ctx: ActionContext, result: ActionResult): void {
    for (const action of actions) this.execute(action, ctx, result);
  },

  register(name: string, fn: ActionFn): void {
    ACTION_REGISTRY[name] = fn;
  },
};
