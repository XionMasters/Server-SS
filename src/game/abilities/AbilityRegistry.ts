/**
 * AbilityRegistry.ts
 *
 * Lista central de todas las habilidades activas del juego.
 *
 * AGREGAR UNA HABILIDAD NUEVA:
 *   1. Crear `src/game/abilities/mi_habilidad.ability.ts`
 *   2. Importarla aquí
 *   3. Agregarla al array `AbilityRegistry`
 *   → ActionResolver.ts no se modifica.
 *
 * ORDEN: no importa para la resolución, pero mantenerlo agrupado
 *   por tipo de caballero ayuda a la legibilidad.
 */

import { Ability } from './AbilityTypes';
import { Match1Ability } from './match1.ability';
import { PhoenixFlamesAbility } from './phoenix-flames.ability';
import { JusticeFistAbility } from './justice-fist.ability';

export const AbilityRegistry: Ability[] = [
  // ── Caballeros de Bronce ──────────────────────────────────────────────────────────────────────────────────────────
  Match1Ability,          // Jabu de Unicornio / Nachi de Lobo
  PhoenixFlamesAbility,   // Ikki de Fénix
  JusticeFistAbility,     // Seiya de Pegaso

  // ── Caballeros de Plata ─────────────────────────────────────────────────
  // (por implementar)

  // ── Caballeros de Oro ───────────────────────────────────────────────────
  // (por implementar)
];
