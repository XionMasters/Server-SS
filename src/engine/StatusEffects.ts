/**
 * StatusEffects.ts
 *
 * Modelo puro de efectos de estado (buffs/debuffs/modos/triggers) para cartas en partida.
 *
 * ✅ Sin dependencias externas — solo tipos y funciones puras.
 * ✅ Serializable — safe para JSON.stringify/parse.
 * ✅ Importar desde aquí en engines, mappers y serializers.
 *
 * ─── ARQUITECTURA ────────────────────────────────────────────────────────────
 *
 * Este archivo es la capa de MODELO Y CICLO DE VIDA de efectos.
 * Encaja en la arquitectura del motor así:
 *
 *   StatusEffects (este archivo)
 *       ↓  alimenta a
 *   LayerResolver (TODO: Fase 2 — con primera técnica que modifique stats)
 *       ↓  alimenta a
 *   RulesEngine / AttackRulesEngine
 *       ↓  alimenta a
 *   ActionResolver
 *
 * ─── CATEGORÍAS ──────────────────────────────────────────────────────────────
 *
 *   mode     → estados de combate mutuamente excluyentes (defense, evasion, prayer)
 *   stat     → modificadores de stats acumulables (ce_boost, ar_boost, hp_boost)
 *              En Fase 2 migran a LayerResolver como Modifiers con layer propio.
 *   trigger  → reaccionan a eventos de combate (burn, poison)
 *              En Fase 3 (Ikki) migran a EventBus: ATTACK_HIT_PLAYER, KNIGHT_DIED, etc.
 *   special  → comportamiento único, se consumen al usarse (ignore_armor)
 *
 * ─── AGREGAR UN EFECTO NUEVO ─────────────────────────────────────────────────
 *
 *   1. Agregar el tipo a StatusEffectType con comentario y categoría.
 *   2. Registrarlo en EFFECT_CATEGORY con su categoría.
 *   3. Implementar la lógica en el engine correspondiente según categoría:
 *   ⚠️  Actualizar también el catálogo en src/views/admin.html → sección "✨ Statuses".
 *      - mode    → CombatResolvers + setModeEffect()
 *      - stat    → computeCeBonus / computeArBonus (hoy) o LayerResolver (Fase 2)
 *      - trigger → AttackRulesEngine (hoy) o EventBus (Fase 3)
 *      - special → AttackRulesEngine o CombatResolvers según el efecto
 */

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — MODEL
// Tipos de datos. Lo que se serializa y persiste en BD.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Categoría funcional de un efecto.
 * Permite al motor filtrar y despachar sin enumerar tipos individuales.
 *
 * TODO (Fase 2): LayerResolver usará esto para ordenar y agrupar modificadores.
 * TODO (Fase 3): EventBus usará la categoría 'trigger' para enrutar a handlers.
 */
export type StatusEffectCategory =
  | 'mode'     // Estados de combate — mutuamente excluyentes
  | 'stat'     // Boosts de stats — acumulables
  | 'trigger'  // Triggers de evento — reaccionan a acciones del juego
  | 'special'; // Comportamiento único — se consumen al ejecutarse

export type StatusEffectSourceType = 'knight' | 'technique' | 'scenario' | 'passive';

/**
 * Metadatos de origen del efecto.
 * player/type son opcionales para compatibilidad con efectos legacy.
 */
export interface StatusEffectSource {
  card_instance_id: string;
  player?: 1 | 2;
  type?: StatusEffectSourceType;
}

/**
 * Todos los tipos de efecto disponibles.
 * Al agregar uno nuevo: registrarlo también en EFFECT_CATEGORY.
 *
 * category: mode ──────────────────────────────────────────────────────────── */
export type StatusEffectType =
  | 'defense'       // Modo Defensa: daño recibido = ceil(CE_atk/2) - AR_def
  | 'evasion'       // Modo Evasión: 50% chance de esquivar AB
  | 'prayer'        // Oración Divina (reservado)
/** category: stat ─────────────────────────────────────────────────────────── */
  | 'ce_boost'      // Aumenta CE en `value` puntos
  | 'ar_boost'      // Aumenta AR en `value` puntos
  | 'hp_boost'      // Aumenta HP máximo en `value` puntos (si expira, current_health se clamp al nuevo máximo)
/** category: special ──────────────────────────────────────────────────────── */
  | 'ignore_armor'  // Próximo AB del portador ignora la AR del defensor (se consume al atacar)
  | 'ce_double'     // Próximo BA del portador tiene CE duplicada (se consume al atacar)
/** category: trigger ──────────────────────────────────────────────────────── */
  | 'burn'             // BRN: causa `value` daño al caballero al inicio de su turno (remaining_turns cuenta regresiva)
  | 'poison'          // Veneno: causa `value` daño al caballero al inicio de su turno (sin countdown, permanente hasta cura)
  | 'last_stand'        // Pasiva Seiya: marker permanente. Al recibir golpe letal activa last_stand_active
  | 'last_stand_active' // Estado temporal (remaining_turns=1): immune a todo daño durante 1 turno
  | 'dot_immune'        // Pasiva: inmune a burn y poison (DOTs) — nuná recibe daño por tick DOT
  // Inmunidades específicas: cada una bloquea exactamente un tipo de efecto DOT
  | 'burn_immune'       // Pasiva: inmune a burn — bloquea la aplicación del efecto y limpia burn existente
  | 'poison_immune'     // Pasiva: inmune a poison — bloquea la aplicación del efecto y limpia poison existente
  | 'phoenix_rebirth_cooldown' // Lock técnico: evita que la resurrección se dispare más de una vez por turno
// TODO (Escenario):      | 'scenario_buff'    // Buff de escenario activo sobre el caballero
;

/**
 * Mapa centralizado: tipo → categoría.
 * Un único lugar donde declarar la naturaleza de cada efecto.
 * El motor puede usar esto en lugar de hardcodear nombres de tipos.
 *
 * @example
 *   if (EFFECT_CATEGORY[e.type] === 'trigger') { ... }
 */
export const EFFECT_CATEGORY: Record<StatusEffectType, StatusEffectCategory> = {
  // mode
  defense:       'mode',
  evasion:       'mode',
  prayer:        'mode',
  // stat
  ce_boost:      'stat',
  ar_boost:      'stat',
  hp_boost:      'stat',
  // special
  ignore_armor:  'special',
  ce_double:     'special',
  // trigger
  burn:            'trigger',
  poison:          'trigger',
  last_stand:        'trigger',
  last_stand_active: 'special',
  dot_immune:        'special', // marker permanente; interpretado en TurnRulesEngine al procesar DOTs
  burn_immune:       'special', // marker permanente — bloquea apply_status de burn y limpia burn existente
  poison_immune:     'special', // marker permanente — bloquea apply_status de poison y limpia poison existente
  phoenix_rebirth_cooldown: 'special',
  // TODO (Escenario): scenario_buff: 'stat',
};

/**
 * Un efecto de estado activo sobre una carta en partida.
 *
 * remaining_turns: se decrementa al INICIO de cada turno del jugador dueño.
 *   - null  = permanente (pasivas, nunca expiran por tick)
 *   - 1     = activo durante el turno del rival, expira al inicio del propio
 *   - 2     = dura 2 turnos propios completos
 *
 * value:  obligatorio para efectos 'stat' (ce_boost, ar_boost, hp_boost).
 * source: metadatos de la carta que aplicó el efecto.
 */
export interface StatusEffect {
  type: StatusEffectType;
  value?: number;
  remaining_turns: number | null;
  source?: StatusEffectSource;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — LIFECYCLE
// Funciones que gestionan el ciclo de vida de los efectos en el tiempo.
// ═════════════════════════════════════════════════════════════════════════════

/** True si el tipo corresponde a la categoría mode. */
export function isModeEffectType(type: StatusEffectType): boolean {
  return EFFECT_CATEGORY[type] === 'mode';
}

/**
 * Parsea status_effects desde JSON (como llega de BD o red).
 * Nunca lanza excepción — retorna array vacío si hay error.
 */
export function parseStatusEffects(raw: unknown): StatusEffect[] {
  try {
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e: any) => e && typeof e.type === 'string')
      .map((e: any) => ({
        ...e,
        source: normalizeSource(e.source),
      })) as StatusEffect[];
  } catch {
    return [];
  }
}

/**
 * Decrementa remaining_turns de cada efecto temporal y elimina los expirados.
 * Los efectos con remaining_turns === null son permanentes y se omiten.
 * Se llama al INICIO del turno del jugador dueño de las cartas.
 */
export function tickStatusEffects(effects: StatusEffect[]): StatusEffect[] {
  return effects
    .map(e => {
      const cloned: StatusEffect = {
        ...e,
        ...(e.source ? { source: { ...e.source } } : {}),
      };
      return cloned.remaining_turns === null
        ? cloned
        : { ...cloned, remaining_turns: cloned.remaining_turns - 1 };
    })
    .filter(e => e.remaining_turns === null || e.remaining_turns > 0);
}

/**
 * Aplica un modo de combate a un array de efectos.
 * Elimina cualquier modo previo (son mutuamente excluyentes) y agrega el nuevo.
 * Pasar remaining_turns = 1 significa: activo durante el turno rival, expira al inicio del propio.
 */
export function setModeEffect(
  effects: StatusEffect[],
  mode: 'defense' | 'evasion' | 'prayer',
  remaining_turns: number = 1,
  source?: StatusEffectSource
): StatusEffect[] {
  const withoutModes = effects.filter(e => !isModeEffectType(e.type));
  return [...withoutModes, { type: mode, remaining_turns, source }];
}

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 3 — DERIVATIONS
// Funciones que extraen información del array de efectos activos.
//
// TODO (Fase 2 — Layer System):
//   computeCeBonus y computeArBonus migrarán a LayerResolver como Modifiers
//   con layer propio (Layer.STATUS). Cuando llegue la primera técnica que
//   modifique stats, este bloque se reemplaza por:
//
//     LayerResolver.resolveKnightStats(knight, context)
//       → aplica Layer.BASE + Layer.STATUS + Layer.TECHNIQUE + Layer.SCENARIO
//
//   Por ahora se mantienen aquí para no over-engineerear antes de tiempo.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Deriva el modo de combate actual a partir de los efectos activos.
 * Si no hay ningún efecto de modo, retorna 'normal'.
 */
export function deriveModeFromEffects(effects: StatusEffect[]): 'normal' | 'defense' | 'evasion' | 'prayer' {
  const modeEffect = effects.find(e => isModeEffectType(e.type));
  return (modeEffect?.type as 'defense' | 'evasion' | 'prayer') ?? 'normal';
}

interface BasicAttackEffectRule {
  ceMultiplier?: number;
  ignoreArmor?: boolean;
  consumeOnAttack?: boolean;
}

// Reglas declarativas para efectos que modifican BA.
// consumeOnAttack: true  → se elimina del efecto tras el primer BA (one-shot, como ignore_armor)
// consumeOnAttack: false → el efecto persiste; cada BA lo aplica mientras esté activo (como ce_double de pasiva)
const BASIC_ATTACK_EFFECT_RULES: Partial<Record<StatusEffectType, BasicAttackEffectRule>> = {
  ignore_armor: { ignoreArmor: true,  consumeOnAttack: true  },
  ce_double:    { ceMultiplier: 2,    consumeOnAttack: false }
};

/** Multiplicador total de CE para BA en base a efectos activos. */
export function getBasicAttackCeMultiplier(effects: StatusEffect[]): number {
  let multiplier = 1;
  for (const effect of effects) {
    const m = BASIC_ATTACK_EFFECT_RULES[effect.type]?.ceMultiplier;
    if (typeof m === 'number' && Number.isFinite(m) && m > 0) {
      multiplier *= m;
    }
  }
  return multiplier;
}

/** True si algún efecto activo permite ignorar AR en BA. */
export function attackerIgnoresArmor(effects: StatusEffect[]): boolean {
  return effects.some(e => BASIC_ATTACK_EFFECT_RULES[e.type]?.ignoreArmor === true);
}

/** Consume efectos de BA marcados como one-shot. */
export function consumeBasicAttackEffects(effects: StatusEffect[]): StatusEffect[] {
  return effects.filter(e => BASIC_ATTACK_EFFECT_RULES[e.type]?.consumeOnAttack !== true);
}

/** True si existe un efecto del tipo indicado. */
export function hasEffect(effects: StatusEffect[], type: StatusEffectType): boolean {
  return effects.some(e => e.type === type);
}

/** Elimina todos los efectos de cierto tipo. */
export function removeEffect(effects: StatusEffect[], type: StatusEffectType): StatusEffect[] {
  return effects.filter(e => e.type !== type);
}

/**
 * Agrega o refresca un efecto por (type + source.card_instance_id).
 * Si ya existe, actualiza remaining_turns/value.
 */
export function addOrRefreshEffect(
  effects: StatusEffect[],
  incoming: StatusEffect,
): StatusEffect[] {
  const sourceId = incoming.source?.card_instance_id;
  const existingIdx = effects.findIndex(e =>
    e.type === incoming.type &&
    e.source?.card_instance_id === sourceId,
  );
  if (existingIdx === -1) return [...effects, incoming];

  const next = [...effects];
  next[existingIdx] = {
    ...next[existingIdx],
    ...(incoming.remaining_turns !== undefined ? { remaining_turns: incoming.remaining_turns } : {}),
    ...(incoming.value !== undefined ? { value: incoming.value } : {}),
    ...(incoming.source ? { source: incoming.source } : {}),
  };
  return next;
}

/**
 * Suma todos los ce_boost activos.
 * TODO (Fase 2): reemplazar por LayerResolver.resolveKnightStats().ce
 */
export function computeCeBonus(effects: StatusEffect[]): number {
  return _sumStatBonus(effects, 'ce_boost');
}

/**
 * Suma todos los ar_boost activos.
 * TODO (Fase 2): reemplazar por LayerResolver.resolveKnightStats().ar
 */
export function computeArBonus(effects: StatusEffect[]): number {
  return _sumStatBonus(effects, 'ar_boost');
}

/** Suma todos los hp_boost activos (aumento de HP máximo). */
export function computeHpBonus(effects: StatusEffect[]): number {
  return _sumStatBonus(effects, 'hp_boost');
}

/**
 * Filtra efectos por categoría. Útil para engines que procesan por tipo.
 *
 * @example
 *   // AttackRulesEngine — procesar todos los triggers activos
 *   const triggers = getEffectsByCategory(effects, 'trigger');
 *
 *   // TODO (Fase 3): EventBus emitirá ATTACK_HIT_PLAYER y cada trigger
 *   // reaccionará en su propio handler en lugar de leerse aquí.
 */
export function getEffectsByCategory(
  effects: StatusEffect[],
  category: StatusEffectCategory
): StatusEffect[] {
  return effects.filter(e => EFFECT_CATEGORY[e.type] === category);
}

function _sumStatBonus(effects: StatusEffect[], type: StatusEffectType): number {
  return effects
    .filter(e => e.type === type)
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

function normalizeSource(source: unknown): StatusEffectSource | undefined {
  if (!source) return undefined;
  if (typeof source === 'string') {
    return { card_instance_id: source };
  }
  if (typeof source === 'object') {
    const s = source as any;
    if (typeof s.card_instance_id === 'string') {
      return {
        card_instance_id: s.card_instance_id,
        ...(s.player === 1 || s.player === 2 ? { player: s.player } : {}),
        ...(typeof s.type === 'string' ? { type: s.type as StatusEffectSourceType } : {}),
      };
    }
  }
  return undefined;
}
