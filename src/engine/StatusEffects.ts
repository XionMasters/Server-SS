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
 *   trigger  → reaccionan a eventos de combate (unicorn_horn, herd_effect)
 *              En Fase 3 (Ikki) migran a EventBus: ATTACK_HIT_PLAYER, KNIGHT_DIED, etc.
 *   special  → comportamiento único, se consumen al usarse (ignore_armor)
 *
 * ─── AGREGAR UN EFECTO NUEVO ─────────────────────────────────────────────────
 *
 *   1. Agregar el tipo a StatusEffectType con comentario y categoría.
 *   2. Registrarlo en EFFECT_CATEGORY con su categoría.
 *   3. Implementar la lógica en el engine correspondiente según categoría:
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
  | 'hp_boost'      // Aumenta HP máximo en `value` puntos
/** category: special ──────────────────────────────────────────────────────── */
  | 'ignore_armor'  // Próximo AB del portador ignora la AR del defensor (se consume al atacar)
/** category: trigger ──────────────────────────────────────────────────────── */
  | 'unicorn_horn'      // Pasiva: cada AB que conecta causa +1 DIP al jugador rival
  | 'herd_effect'       // Pasiva: +1 DIP extra cuando el AB ya causa DIP al jugador rival
  | 'burn'             // BRN: causa `value` daño al caballero al inicio de su turno (remaining_turns cuenta regresiva)
  | 'phoenix_rebirth'  // Pasiva Ikki: marker permanente. Trigger KNIGHT_DIED (Fase 3/EventBus): regresa del Yomotsu cuando un aliado muere
  | 'last_stand'        // Pasiva Seiya: marker permanente. Al recibir golpe letal activa last_stand_active
  | 'last_stand_active' // Estado temporal (remaining_turns=1): immune a todo daño durante 1 turno
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
  // trigger
  unicorn_horn:    'trigger',
  herd_effect:     'trigger',
  burn:            'trigger',
  phoenix_rebirth: 'trigger',
  last_stand:        'trigger',
  last_stand_active: 'special',
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
 * source: instance_id de la carta que aplicó el efecto.
 *         TODO (Fase 3): expandir a { source_card_id, source_player, source_type }
 *         para poder eliminar buffs al morir la carta fuente (equipamiento, técnicas).
 */
export interface StatusEffect {
  type: StatusEffectType;
  value?: number;
  remaining_turns: number | null;
  source?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — LIFECYCLE
// Funciones que gestionan el ciclo de vida de los efectos en el tiempo.
// ═════════════════════════════════════════════════════════════════════════════

/** Tipos de efecto que representan un modo de combate (mutuamente excluyentes). */
export const MODE_EFFECT_TYPES: StatusEffectType[] = ['defense', 'evasion', 'prayer'];

/**
 * Parsea status_effects desde JSON (como llega de BD o red).
 * Nunca lanza excepción — retorna array vacío si hay error.
 */
export function parseStatusEffects(raw: unknown): StatusEffect[] {
  try {
    if (!raw) return [];
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
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
    .map(e => e.remaining_turns === null
      ? e
      : { ...e, remaining_turns: e.remaining_turns - 1 }
    )
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
  source?: string
): StatusEffect[] {
  const withoutModes = effects.filter(e => !MODE_EFFECT_TYPES.includes(e.type));
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
  const modeEffect = effects.find(e => MODE_EFFECT_TYPES.includes(e.type));
  return (modeEffect?.type as 'defense' | 'evasion' | 'prayer') ?? 'normal';
}

/**
 * Suma todos los ce_boost activos.
 * TODO (Fase 2): reemplazar por LayerResolver.resolveKnightStats().ce
 */
export function computeCeBonus(effects: StatusEffect[]): number {
  return effects
    .filter(e => e.type === 'ce_boost')
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

/**
 * Suma todos los ar_boost activos.
 * TODO (Fase 2): reemplazar por LayerResolver.resolveKnightStats().ar
 */
export function computeArBonus(effects: StatusEffect[]): number {
  return effects
    .filter(e => e.type === 'ar_boost')
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
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
