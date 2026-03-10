/**
 * ConditionRegistry.ts
 *
 * Evaluadores de condiciones declarativas de habilidades.
 *
 * Condiciones disponibles:
 *   has_status       → la carta fuente tiene cierto StatusEffect activo
 *   no_status        → la carta fuente NO tiene cierto StatusEffect
 *   cosmos_min       → la carta fuente tiene >= N CP actuales
 *   hand_not_empty   → el jugador tiene al menos 1 carta en mano
 *   field_not_empty  → el jugador tiene al menos 1 caballero en campo
 *   self_in_zone     → la carta fuente está en cierta zona
 *   hp_below         → la carta fuente tiene HP <= N
 *   enemy_has_status → el objetivo (targetCard) o cualquier caballero rival tiene cierto status
 *
 * Para añadir una nueva condición:
 *   ConditionRegistry.register('nombre', fn);
 */

import type { ConditionDefinition } from '../abilities/AbilityDefinition';
import type { GameEvent } from '../events/GameEvents';

// ─── Tipos de referencia (sin depender de GameState completo) ─────────────────

/** Referencia ligera a un status effect dentro del contexto de condición. */
export interface StatusEffectRef {
  type: string;
  remaining_turns?: number | null;
  value?: number;
  source?: string;
}

/** Referencia ligera a una carta dentro del contexto de condición. */
export interface CardRef {
  /** Puede estar ausente cuando el contexto se construye de forma simplificada (ActionResolver). */
  instance_id?: string;
  zone?: string;
  current_cosmos: number;
  /** Disponible en contextos de combate; ausente en validaciones previas al campo. */
  current_health?: number;
  status_effects: StatusEffectRef[];
}

export interface PlayerRef {
  hand: CardRef[];
  field_knights: CardRef[];
}

/** Contexto con la información mínima para evaluar condiciones.
 *  Compatible con GameState puro (KnightManager) y modelos Sequelize (ActionResolver). */
export interface ConditionContext {
  sourceCard: CardRef;
  player: PlayerRef;
  /** Presente en condiciones que inspeccionan el estado del rival. Opcional por compatibilidad. */
  opponent?: PlayerRef;
  /** Carta objetivo ya resuelta. Disponible cuando el cliente envió un targetId. */
  targetCard?: CardRef;
  event: GameEvent;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

type ConditionFn = (condition: ConditionDefinition, ctx: ConditionContext) => boolean;

const CONDITION_REGISTRY: Record<string, ConditionFn> = {
  has_status: (cond, ctx) =>
    ctx.sourceCard.status_effects.some(e => e.type === cond.status),

  no_status: (cond, ctx) =>
    !ctx.sourceCard.status_effects.some(e => e.type === cond.status),

  cosmos_min: (cond, ctx) =>
    (ctx.sourceCard.current_cosmos ?? 0) >= (cond.amount ?? 0),

  hand_not_empty: (_cond, ctx) =>
    (ctx.player.hand?.length ?? 0) > 0,

  field_not_empty: (_cond, ctx) =>
    (ctx.player.field_knights?.length ?? 0) > 0,

  self_in_zone: (cond, ctx) =>
    ctx.sourceCard.zone === cond.zone,

  hp_below: (cond, ctx) =>
    (ctx.sourceCard.current_health ?? 0) <= (cond.amount ?? 0),

  /** Verdadero si el targetCard (o algún caballero rival) tiene el status. */
  enemy_has_status: (cond, ctx) => {
    if (ctx.targetCard) {
      return ctx.targetCard.status_effects.some(e => e.type === cond.status);
    }
    return (ctx.opponent?.field_knights ?? []).some(k =>
      k.status_effects.some(e => e.type === cond.status),
    );
  },
};

export const ConditionRegistry = {
  evaluate(condition: ConditionDefinition, ctx: ConditionContext): boolean {
    const fn = CONDITION_REGISTRY[condition.type];
    if (!fn) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[ConditionRegistry] Condición desconocida: "${condition.type}"`);
      }
      return false;
    }
    return fn(condition, ctx);
  },

  /**
   * AND: todas las condiciones deben cumplirse.
   * Usa caché local por batch: si la misma condición aparece dos veces, solo se evalúa una.
   */
  evaluateAll(conditions: ConditionDefinition[] = [], ctx: ConditionContext): boolean {
    const cache = new Map<string, boolean>();
    return conditions.every(c => {
      const key = JSON.stringify(c);
      if (cache.has(key)) return cache.get(key)!;
      const result = this.evaluate(c, ctx);
      cache.set(key, result);
      return result;
    });
  },

  /**
   * OR: al menos una condición debe cumplirse.
   * Útil para cartas con condiciones alternativas (ej: cosmos >= 3 O tiene status X).
   */
  evaluateAny(conditions: ConditionDefinition[] = [], ctx: ConditionContext): boolean {
    const cache = new Map<string, boolean>();
    return conditions.some(c => {
      const key = JSON.stringify(c);
      if (cache.has(key)) return cache.get(key)!;
      const result = this.evaluate(c, ctx);
      cache.set(key, result);
      return result;
    });
  },

  register(name: string, fn: ConditionFn): void {
    CONDITION_REGISTRY[name] = fn;
  },
};
