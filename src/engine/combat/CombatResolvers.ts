import { CombatContext, CombatResult } from "./CombatTypes";
import { SeededRNG } from "./RNG";

export type CombatResolver = (
  ctx: CombatContext,
  rng: SeededRNG
) => CombatResult;

/** Devuelve true si el atacante tiene el efecto ignore_armor activo */
function _attackerIgnoresArmor(ctx: CombatContext): boolean {
  return (ctx.attacker.status_effects ?? []).some(e => e.type === 'ignore_armor');
}

export const CombatModeResolvers: Record<string, CombatResolver> = {

  normal: (ctx) => {
    const effectiveAR = _attackerIgnoresArmor(ctx) ? 0 : (ctx.defender?.ar ?? 0);
    const raw = ctx.attacker.ce - effectiveAR;
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

  defense: (ctx) => {
    // En modo defensa, el CE atacante se reduce a la mitad antes de aplicar ignore_armor
    const halfCE = Math.floor(ctx.attacker.ce / 2);
    const effectiveAR = _attackerIgnoresArmor(ctx) ? 0 : (ctx.defender?.ar ?? 0);
    const raw = halfCE - effectiveAR;
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

  evasion: (ctx, rng) => {
    if (rng.next() < 0.5) {
      const effectiveAR = _attackerIgnoresArmor(ctx) ? 0 : (ctx.defender?.ar ?? 0);
      const raw = ctx.attacker.ce - effectiveAR;
      return { damageToCard: Math.max(1, raw), evaded: false };
    }
    return { damageToCard: 0, evaded: true };
  },

  // prayer: manejar cuando se diseñe la habilidad Oración Divina
  prayer: (ctx) => {
    const effectiveAR = _attackerIgnoresArmor(ctx) ? 0 : (ctx.defender?.ar ?? 0);
    const raw = ctx.attacker.ce - effectiveAR;
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

};