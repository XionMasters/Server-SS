/**
 * AbilityDefinition.ts
 *
 * Esquema declarativo de habilidades — almacenado en card_abilities.effects (JSONB).
 *
 * Con este esquema agregar una nueva carta NO require código TypeScript:
 * solo hay que describir su comportamiento en JSON en la base de datos.
 *
 * ── Ejemplos ─────────────────────────────────────────────────────
 *
 * Match 1 (Jabu / Nachi) — activa:
 * {
 *   "trigger": "ACTIVE",
 *   "cost": [{ "type": "cosmos", "amount": 3 }],
 *   "conditions": [{ "type": "no_status", "status": "ignore_armor" }],
 *   "actions": [{ "type": "apply_status", "status": "ignore_armor", "target": "self" }]
 * }
 *
 * Cuerno de Unicornio (Jabu) — pasiva de entrada:
 * {
 *   "trigger": "CARD_PLAYED",
 *   "actions": [{ "type": "apply_status", "status": "unicorn_horn", "target": "self" }]
 * }
 *
 * Phoenix Flames (Ikki) — activa con coin flip y objetivo:
 * {
 *   "trigger": "ACTIVE",
 *   "cost": [{ "type": "cosmos", "amount": 3 }],
 *   "conditions": [{ "type": "has_status", "status": "phoenix_rebirth" }],
 *   "actions": [{
 *     "type": "coin_flip_then",
 *     "heads": [{ "type": "apply_status", "status": "burn",
 *                 "target": "target", "value": 1, "duration": 3 }]
 *   }]
 * }
 *
 * Justice Fist (Seiya) — activa con costo de descarte:
 * {
 *   "trigger": "ACTIVE",
 *   "cost": [{ "type": "discard", "target": "self_hand", "amount": 1 }],
 *   "conditions": [{ "type": "has_status", "status": "last_stand" }],
 *   "actions": [{ "type": "apply_status", "status": "ignore_armor", "target": "self" }]
 * }
 */

// ─── Target types ─────────────────────────────────────────────────────────────

/**
 * Targets declarativos que resuelven cartas en el campo/mano.
 * 'target' = carta elegida explícitamente por el cliente via targetCardId.
 * 'self' = la carta que activa la habilidad (sourceCardId).
 * 'all_allies' / 'all_enemies' = todas las cartas del mismo jugador / oponente.
 * Para targets más complejos (ej. "todos los aliados con HP < 3"), se pueden crear nuevos tipos
 * y resolverlos en TargetResolver.resolve() usando el contexto de la acción.
 */
export type TargetType =
  | 'self'
  | 'target'
  | 'all_allies'
  | 'all_enemies'
  | 'adjacent_allies'
  | 'adjacent_enemies'
  | 'target_and_adjacent_enemies'
  | 'opponent_helper'
  | 'opponent_technique'
  | 'random_enemy'
  | 'random_ally'
  | 'other_allies'
  | 'lowest_health_enemy';

// ─── Trigger types ────────────────────────────────────────────────────────────

import type { GameEventType } from '../events/GameEvents';

/**
 * Triggers reconocidos por el motor.
 * Se deriva directamente de GameEventType para garantizar sincronía:
 * añadir un valor en GameEvents.ts lo expone automáticamente aquí.
 */
export type AbilityTrigger = GameEventType;

// ─── Action union ─────────────────────────────────────────────────────────────

/** Aplica (o refresca) un StatusEffect sobre los targets resueltos. */
export interface ApplyStatusAction {
  type: 'apply_status';
  status: string;
  target?: TargetType;
  /** Duración en turnos. null = permanente, 0 = expira al inicio del turno siguiente. */
  duration?: number;
  value?: number;
}

/**
 * Lanza una moneda.
 * Alias soportados: heads/on_heads (cara), tails/on_fail (cruz) — ambos equivalentes.
 */
export interface CoinFlipAction {
  type: 'coin_flip_then';
  heads?:    ActionDefinition[];
  on_heads?: ActionDefinition[];
  tails?:    ActionDefinition[];
  on_fail?:  ActionDefinition[];
}

/**
 * Union tipada de todas las acciones del motor.
 * Para agregar una nueva acción: añadir su interface arriba e incluirla aquí.
 */
export type ActionDefinition =
  | ApplyStatusAction
  | CoinFlipAction;

// ─── Condition & Cost ─────────────────────────────────────────────────────────

export interface ConditionDefinition {
  type: string;
  [key: string]: any;
}

export interface CostDefinition {
  type: 'cosmos' | 'discard' | 'life';
  /** Para 'cosmos': cantidad de CP requerida en la carta que activa. */
  amount?: number;
  /** Para 'discard': zona de origen. 'self_hand' = mano del jugador. */
  target?: 'self_hand';
}

// ─── AbilityDefinition ────────────────────────────────────────────────────────

export interface AbilityDefinition {
  /** Cuándo se activa. 'ACTIVE' = activación manual del jugador. */
  trigger: AbilityTrigger;
  /** Costos que el jugador debe pagar antes de ejecutar las acciones. */
  cost?: CostDefinition[];
  /** Condiciones adicionales requeridas para poder activar. */
  conditions?: ConditionDefinition[];
  /** Efectos que produce la habilidad. */
  actions: ActionDefinition[];
}

/**
 * Habilidad con su definición ya parseada, lista para despacho en runtime.
 * Se almacena en CardInGameState.raw_abilities para que el PassiveTriggerEngine
 * pueda disparar triggers sin acceder a la BD.
 */
export interface RawAbility {
  /** Slug estable de la habilidad (ej: 'justice_fist'). Null si no fue asignado en BD. */
  ability_key: string | null;
  /** Solo las 'pasiva' son procesadas automáticamente por PassiveTriggerEngine. */
  type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
  /** Definición ya decodificada y validada. */
  effects: AbilityDefinition;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Targets que requieren que el cliente envíe un targetCardId. */
const CLIENT_TARGET_TYPES = new Set<TargetType>([
  'target',
  'adjacent_enemies',
  'target_and_adjacent_enemies',
  'opponent_technique',
]);

/** Determina si la habilidad requiere que el cliente envíe un targetId. */
export function requiresClientTarget(def: AbilityDefinition): boolean {
  const costNeedsTarget = (def.cost ?? []).some(c => c.type === 'discard');
  return costNeedsTarget || _actionsNeedTarget(def.actions);
}

function _actionsNeedTarget(actions: ActionDefinition[]): boolean {
  for (const action of actions) {
    if ('target' in action && action.target && CLIENT_TARGET_TYPES.has(action.target)) return true;
    // Recursivo: buscar en ramas de coin_flip_then
    const branches = [
      ...(('heads'    in action && Array.isArray(action.heads))    ? action.heads    : []),
      ...(('on_heads' in action && Array.isArray(action.on_heads)) ? action.on_heads : []),
      ...(('tails'    in action && Array.isArray(action.tails))    ? action.tails    : []),
      ...(('on_fail'  in action && Array.isArray(action.on_fail))  ? action.on_fail  : []),
    ];
    if (branches.length > 0 && _actionsNeedTarget(branches)) return true;
  }
  return false;
}

/** Extrae el costo en cosmos de la definición (0 si no tiene). */
export function getCosmosCost(def: AbilityDefinition): number {
  return (def.cost ?? []).find(c => c.type === 'cosmos')?.amount ?? 0;
}

/** True si la habilidad es activada manualmente por el jugador. */
export function isActiveAbility(def: AbilityDefinition): boolean {
  return def.trigger === 'ACTIVE';
}

/** True si la habilidad es reactiva (pasiva, trigger automático). */
export function isPassiveAbility(def: AbilityDefinition): boolean {
  return def.trigger !== 'ACTIVE';
}

/**
 * Parsea y valida el campo effects del JSONB.
 * Retorna null si el JSON es inválido o tiene estructura incorrecta,
 * logueando una advertencia para facilitar el debugging en producción.
 */
export function parseAbilityDef(effects: any): AbilityDefinition | null {
  if (!effects) return null;
  try {
    const def = typeof effects === 'string' ? JSON.parse(effects) : effects;
    if (typeof def.trigger !== 'string') {
      console.warn('[AbilityDefinition] parseAbilityDef: falta "trigger"', effects);
      return null;
    }
    if (!Array.isArray(def.actions)) {
      console.warn('[AbilityDefinition] parseAbilityDef: "actions" debe ser un array', effects);
      return null;
    }
    if (def.actions.some((a: any) => !a || typeof a.type !== 'string')) {
      console.warn('[AbilityDefinition] parseAbilityDef: acción sin "type" válido', effects);
      return null;
    }
    return def as AbilityDefinition;
  } catch (e) {
    console.warn('[AbilityDefinition] parseAbilityDef: JSON inválido', effects, e);
    return null;
  }
}

