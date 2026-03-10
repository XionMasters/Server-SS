/**
 * justice-fist.ability.ts
 *
 * Habilidad activa "Justice Fist" — Seiya de Pegaso
 *
 * Mecánica (de la carta):
 *   "Discard a card, user's next BA ignores Armor."
 *
 * Detalles de implementación:
 *   - Costo        : descartar 1 carta de la mano propia (no CP)
 *   - targetId     : instance_id de la carta de mano a descartar
 *   - requires_target: true (el cliente envía targetId = la carta a descartar)
 *   - Efecto       : aplica StatusEffect('ignore_armor', remaining_turns=null)
 *                    al portador → se consume automáticamente al realizar el próximo AB
 *
 * La habilidad está disponible cuando:
 *   - El caballero tiene StatusEffect `last_stand` (marcador pasivo de Seiya)
 *   - El jugador tiene al menos 1 carta en la mano
 *
 * La validación de que la carta a descartar existe en la mano del jugador
 * ocurre en KnightRulesEngine (GameState tiene player.hand).
 */

import { Ability, AbilityContext } from './AbilityTypes';

export const JusticeFistAbility: Ability = {
  name: 'justice_fist',
  cosmos_cost: 0,
  requires_target: true,

  canUse(ctx: AbilityContext): boolean {
    const effects: any[] = ctx.knight.status_effects ?? [];

    // Solo disponible para Seiya (caballero con el marcador last_stand)
    // La validación de que haya carta en mano para descartar ocurre en KnightRulesEngine
    return effects.some(e => e.type === 'last_stand');
  },
};
