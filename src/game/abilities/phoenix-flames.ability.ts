/**
 * phoenix-flames.ability.ts
 *
 * Habilidad activa "Phoenix Flames" — Ikki de Fénix
 *
 * Mecánica (de la carta):
 *   "Pay 3 Cp; flip a coin, if heads causes BRN condition on the target soldier."
 *
 * Detalles de implementación:
 *   - Costo      : 3 CP (Cosmos Points de la carta, NO del jugador)
 *   - Objetivo   : un caballero enemigo en campo (requires_target = true)
 *   - Coin flip  : 50% heads / 50% tails (Math.random() en KnightRulesEngine)
 *   - Si CARA    : BRN aplicado al objetivo → { type: 'burn', value: 1, remaining_turns: 3 }
 *                  → 1 daño al inicio del turno del objetivo, durante 3 turnos
 *   - Si CRUZ    : 3 CP consumidos, sin efecto adicional
 *
 * La habilidad está disponible cuando:
 *   - El caballero tiene el StatusEffect `phoenix_rebirth` (marcador de que es Ikki)
 *   - El caballero tiene >= 3 CP en current_cosmos
 *
 * Nota sobre Return (pasiva):
 *   La habilidad "Return" de Ikki (regresar del Yomotsu cuando muere un aliado)
 *   está pendiente para Fase 3 (EventBus / KNIGHT_DIED event).
 *   El StatusEffect `phoenix_rebirth` sirve como marcador ahora y como trigger
 *   en Fase 3. Ver: src/engine/StatusEffects.ts y TODO en KnightManager.ts
 */

import { Ability, AbilityContext } from './AbilityTypes';

export const PhoenixFlamesAbility: Ability = {
  name: 'phoenix_flames',
  cosmos_cost: 3,
  requires_target: true,

  canUse(ctx: AbilityContext): boolean {
    const effects: any[] = ctx.knight.status_effects ?? [];

    // Solo disponible para Ikki (caballero con el marcador phoenix_rebirth)
    const isIkki = effects.some(e => e.type === 'phoenix_rebirth');

    // Necesita >= 3 CP propios
    const enoughCp = (ctx.knight.current_cosmos ?? 0) >= 3;

    return isIkki && enoughCp;
  },
};
