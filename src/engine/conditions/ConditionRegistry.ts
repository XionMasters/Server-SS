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
 *   event_card_code  → el card_code de la carta que originó el evento coincide con uno de los
 *                      valores declarados. Acepta string o array de strings.
 *                      Ej: { "type": "event_card_code", "code": "ikki_phoenix" }
 *                      Ej: { "type": "event_card_code", "code": ["ikki_phoenix", "ikki_phoenix_v2", "ikki_leo"] }
 *   attack_type_is   → valida payload.attack_type del evento (ej: BA | TA)
 *   event_source_is_self → true si event.sourceCardId === sourceCard.instance_id
 *   event_player_damage_min → valida payload.damage_to_player >= amount
 *   event_target_health_pct_below → valida payload.target_health_pct < percent
 *   event_death_reason_not → verdadero si payload.death_reason !== value
 *
 * Para añadir una nueva condición:
 *   ConditionRegistry.register('nombre', fn);
 *   ⚠️  Actualizar también el catálogo en src/views/admin.html → sección "🔒 Conditions".
 */

import type { ConditionDefinition } from '../abilities/AbilityDefinition';
import type { GameEvent } from '../events/GameEvents';

// ─── Tipos de referencia (sin depender de GameState completo) ─────────────────

/** Referencia ligera a un status effect dentro del contexto de condición. */
export interface StatusEffectRef {
  type: string;
  remaining_turns?: number | null;
  value?: number;
  source?: string | { card_instance_id: string; player?: 1 | 2; type?: string };
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
  life?: number;
  cosmos?: number;
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

  /**
   * Verdadero si el card_code de la carta que originó el evento está en la lista declarada.
   * `code` puede ser un string único o un array de strings.
   *
   * Ejemplo JSON en la habilidad:
   *   { "type": "event_card_code", "code": "ikki_phoenix" }
   *   { "type": "event_card_code", "code": ["ikki_phoenix", "ikki_phoenix_v2", "ikki_leo"] }
   *
   * El código viene de ctx.event.payload.card_code, que PassiveTriggerEngine
   * inyecta en eventos KNIGHT_DIED y ALLY_DIED.
   */
  event_card_code: (cond, ctx) => {
    const eventCode: string | undefined = (ctx.event.payload as any)?.card_code;
    if (!eventCode) return false;
    const codes: string[] = Array.isArray(cond.code) ? cond.code : [cond.code];
    return codes.includes(eventCode);
  },

  /** Valida tipo de ataque expuesto por el evento (ej: ATTACK_CONNECTED). */
  attack_type_is: (cond, ctx) => {
    const attackType: string | undefined = (ctx.event.payload as any)?.attack_type;
    return !!attackType && attackType === cond.value;
  },

  /** Verdadero si la carta que originó el evento es la misma que porta esta habilidad. */
  event_source_is_self: (_cond, ctx) => {
    if (!ctx.sourceCard.instance_id) return false;
    return ctx.event.sourceCardId === ctx.sourceCard.instance_id;
  },

  /** Verdadero si el evento reporta daño al jugador >= amount. */
  event_player_damage_min: (cond, ctx) => {
    const directDamage: number = Number((ctx.event.payload as any)?.damage_to_player ?? 0);
    return directDamage >= Number(cond.amount ?? 0);
  },

  /** Verdadero si el objetivo del evento quedó por debajo de X% de vida. */
  event_target_health_pct_below: (cond, ctx) => {
    const targetPct = Number((ctx.event.payload as any)?.target_health_pct);
    const threshold = Number(cond.percent ?? cond.value ?? 0);
    if (!Number.isFinite(targetPct) || !Number.isFinite(threshold)) return false;
    return targetPct < threshold;
  },

  /** Excluye una causa de muerte del evento (ej: 'sacrifice'). */
  event_death_reason_not: (cond, ctx) => {
    const reason: string | undefined = (ctx.event.payload as any)?.death_reason;
    return reason !== cond.value;
  },

  /**
   * Verdadero si la vida del jugador activo es <= amount.
   * Usado para habilidades que se potencian cuando el jugador está en desventaja.
   *
   * Ejemplo JSON: { "type": "player_lp_below", "amount": 4 }
   */
  player_lp_below: (cond, ctx) =>
    ((ctx.player as any).life ?? Infinity) <= (cond.amount ?? 0),

  /**
   * Verdadero si al menos un caballero aliado en campo tiene el card_code indicado.
   * Usado por cartas objeto/equipamiento que requieren un caballero específico en campo.
   *
   * Ejemplo JSON: { "type": "field_has_card_code", "code": "shun_andromeda_v1" }
   *
   * Nota: field_knights en PlayerRef son en realidad CardInGameState en runtime,
   * por lo que se accede a card_code via cast a any.
   */
  field_has_card_code: (cond, ctx) => {
    const code: string | undefined = cond.code as string | undefined;
    if (!code) return false;
    return (ctx.player.field_knights as any[]).some(
      (k: any) => k.card_code === code,
    );
  },

  /**
   * Verdadero si al menos un caballero aliado en campo tiene el tag indicado.
   * Más genérico que field_has_card_code: cubre versiones múltiples de un mismo personaje.
   *
   * Ejemplo JSON: { "type": "field_has_tag", "tag": "shun" }
   *              { "type": "field_has_tag", "tag": "andromeda" }
   */
  field_has_tag: (cond, ctx) => {
    const tag: string | undefined = (cond as any).tag as string | undefined;
    if (!tag) return false;
    return (ctx.player.field_knights as any[]).some(
      (k: any) => Array.isArray(k.tags) && k.tags.includes(tag),
    );
  },
  /**
   * Verdadero si la carta en event.targetCardId tiene CE < amount.
   * Usado en triggers BA_RECEIVED para condiciones sobre el atacante.
   *
   * Ejemplo JSON: { "type": "target_ce_below", "amount": 7 }
   */
  target_ce_below: (cond, ctx) => {
    const targetId = ctx.event?.targetCardId;
    if (!targetId) return false;
    // Buscar en ambos jugadores (el target puede ser de cualquier bando)
    const allKnights = [
      ...(ctx.player.field_knights as any[]),
      ...(ctx.opponent?.field_knights as any[] ?? []),
    ];
    const card = allKnights.find((k: any) => k.instance_id === targetId);
    return card ? (card.ce ?? 0) < (cond.amount ?? 0) : false;
  },

  /**
   * Verdadero si al menos una carta en la MANO del jugador tiene el tag indicado.
   * Usado para habilidades que requieren descartar un tipo específico de carta.
   *
   * Ejemplo JSON: { "type": "hand_has_tag", "tag": "black_saint" }
   */
  hand_has_tag: (cond, ctx) => {
    const tag: string | undefined = (cond as any).tag as string | undefined;
    if (!tag) return false;
    return (ctx.player.hand as any[]).some(
      (c: any) => Array.isArray(c.tags) && c.tags.includes(tag),
    );
  },

  /**
   * Verdadero si al menos un caballero del OPONENTE en campo tiene alguno de los tags indicados.
   * Acepta `tags` (array) o `tag` (string único).
   *
   * Ejemplo JSON: { "type": "opponent_field_has_any_tag", "tags": ["bronze", "silver"] }
   *              { "type": "opponent_field_has_any_tag", "tag": "bronze" }
   */
  opponent_field_has_any_tag: (cond, ctx) => {
    const tags: string[] = Array.isArray((cond as any).tags)
      ? (cond as any).tags
      : ((cond as any).tag ? [(cond as any).tag] : []);
    if (tags.length === 0) return false;
    return (ctx.opponent?.field_knights as any[] ?? []).some(
      (k: any) => Array.isArray(k.tags) && tags.some(tag => k.tags.includes(tag)),
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
