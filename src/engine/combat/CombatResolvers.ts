import { CombatContext, CombatResult } from "./CombatTypes";
import { SeededRNG } from "./RNG";

export type CombatResolver = (
  ctx: CombatContext,
  rng: SeededRNG
) => CombatResult;

export const CombatModeResolvers: Record<string, CombatResolver> = {

  normal: (ctx) => {
    const raw = ctx.attacker.ce - (ctx.defender?.ar ?? 0);
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

  defense: (ctx) => {
    const raw = Math.floor(ctx.attacker.ce / 2) - (ctx.defender?.ar ?? 0);
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

  evasion: (ctx, rng) => {
    if (rng.next() < 0.5) {
      const raw = ctx.attacker.ce - (ctx.defender?.ar ?? 0);
      return { damageToCard: Math.max(1, raw), evaded: false };
    }
    return { damageToCard: 0, evaded: true };
  },

  // prayer: manejar cuando se diseñe la habilidad Oración Divina
  prayer: (ctx) => {
    const raw = ctx.attacker.ce - (ctx.defender?.ar ?? 0);
    return { damageToCard: Math.max(1, raw), evaded: false };
  },

};