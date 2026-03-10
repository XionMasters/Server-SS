/**
 * match1.ability.ts
 *
 * Habilidad activa "Match 1"
 *
 * Caballeros que la poseen: Jabu de Unicornio, Nachi de Lobo.
 * La poseen si tienen el StatusEffect `unicorn_horn` o `herd_effect`
 * (pasivas que se aplican al entrar en campo desde CardManager).
 *
 * Costo    : 3 CP de la carta (no cosmos del jugador)
 * Efecto   : el siguiente AB del portador ignora la AR del defensor
 * Motor    : KnightRulesEngine.useAbility('match_1') → agrega ignore_armor
 */

import { Ability, AbilityContext } from './AbilityTypes';

export const Match1Ability: Ability = {
  name: 'match_1',
  cosmos_cost: 3,

  canUse(ctx: AbilityContext): boolean {
    const effects: any[] = ctx.knight.status_effects ?? [];

    // La habilidad está disponible si el caballero tiene la pasiva que la habilita...
    const hasPassive =
      effects.some(e => e.type === 'unicorn_horn') ||
      effects.some(e => e.type === 'herd_effect');

    // ...pero no si ya tiene ignore_armor activo (evita activar dos veces)
    const alreadyActive = effects.some(e => e.type === 'ignore_armor');

    // ...y el caballero tiene suficientes CP propios
    const enoughCp = (ctx.knight.current_cosmos ?? 0) >= 3;

    return hasPassive && !alreadyActive && enoughCp;
  },
};
