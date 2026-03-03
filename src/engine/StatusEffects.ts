/**
 * StatusEffects.ts
 *
 * Lógica pura de efectos de estado (buffs/debuffs/modos) para cartas en partida.
 * Separado de GameState.ts para mantener el contrato de datos limpio.
 *
 * ✅ Sin dependencias externas — solo tipos y funciones puras.
 * ✅ Importar desde aquí en engines, mappers y serializers.
 */

// ─────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────

/**
 * Tipos de efectos de estado disponibles.
 * Los de tipo "modo" (defense/evasion/prayer) son mutuamente excluyentes.
 * Los de tipo "boost" son acumulables.
 */
export type StatusEffectType =
  | 'defense'    // Modo Defensa: daño recibido = floor(CE_atk/2) - AR_def
  | 'evasion'    // Modo Evasión: 50% chance de esquivar ataques básicos
  | 'prayer'     // Oración Divina (reservado)
  | 'ce_boost'   // Aumenta CE (Combat Effectiveness / Ataque) en `value` puntos
  | 'ar_boost'   // Aumenta AR (Armor Rating / Defensa) en `value` puntos
  | 'hp_boost';  // Aumenta HP máximo en `value` puntos

/**
 * Un efecto de estado activo sobre una carta.
 *
 * remaining_turns: se decrementa al INICIO de cada turno del jugador dueño.
 *   - Valor 1 = activo durante el turno del rival, expira al inicio del próximo turno propio.
 *   - Valor 2 = dura 2 turnos propios completos.
 *
 * value: obligatorio para ce_boost / ar_boost / hp_boost; omitir para modos defensivos.
 * source: instance_id de la carta que aplicó el efecto (opcional, para futuras habilidades).
 */
export interface StatusEffect {
  type: StatusEffectType;
  value?: number;
  remaining_turns: number;
  source?: string;
}

// ─────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────

/** Tipos de efecto que representan un modo de combate (mutuamente excluyentes). */
export const MODE_EFFECT_TYPES: StatusEffectType[] = ['defense', 'evasion', 'prayer'];

// ─────────────────────────────────────────────────────
// FUNCIONES PURAS
// ─────────────────────────────────────────────────────

/**
 * Deriva el modo de combate actual a partir de los efectos activos.
 * Si hay varios efectos de modo (no debería), prevalece el primero.
 */
export function deriveModeFromEffects(effects: StatusEffect[]): 'normal' | 'defense' | 'evasion' | 'prayer' {
  const modeEffect = effects.find(e => MODE_EFFECT_TYPES.includes(e.type));
  return (modeEffect?.type as 'defense' | 'evasion' | 'prayer') ?? 'normal';
}

/**
 * Calcula el bonus total de CE activo (suma de todos los ce_boost vigentes).
 */
export function computeCeBonus(effects: StatusEffect[]): number {
  return effects
    .filter(e => e.type === 'ce_boost')
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

/**
 * Calcula el bonus total de AR activo (suma de todos los ar_boost vigentes).
 */
export function computeArBonus(effects: StatusEffect[]): number {
  return effects
    .filter(e => e.type === 'ar_boost')
    .reduce((sum, e) => sum + (e.value ?? 0), 0);
}

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
 * Decrementa remaining_turns de cada efecto y elimina los expirados.
 * Retorna el nuevo array de efectos.
 */
export function tickStatusEffects(effects: StatusEffect[]): StatusEffect[] {
  return effects
    .map(e => ({ ...e, remaining_turns: e.remaining_turns - 1 }))
    .filter(e => e.remaining_turns > 0);
}

/**
 * Reemplaza todos los efectos de modo en el array con uno nuevo.
 * Conserva los efectos de boost que no son modos.
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
