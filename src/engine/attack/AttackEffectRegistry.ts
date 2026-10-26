import type { EngineContext } from '../EngineContext';
import type { CardInGameState } from '../GameState';
import { findCardInPlayerField } from '../combat/CombatTypes';
import {
  StatusEffectType,
  addOrRefreshEffect,
  attackerHasDragonRage,
  attackerHasElectricCharge,
  consumeBasicAttackEffects,
} from '../StatusEffects';
import { applyDamage } from '../actions/DamageAction';

export interface BasicAttackEffectContext {
  engineCtx: EngineContext;
  attacker: CardInGameState;
  attackerCardId: string;
  defenderCardId: string | null;
  playerNumber: 1 | 2;
  evaded: boolean;
}

function findDefender(ctx: BasicAttackEffectContext): CardInGameState | null {
  if (!ctx.defenderCardId) return null;
  const defenderPlayer = ctx.playerNumber === 1 ? ctx.engineCtx.state.player2 : ctx.engineCtx.state.player1;
  return findCardInPlayerField(defenderPlayer, ctx.defenderCardId);
}

function applyParalyzeOnHit(ctx: BasicAttackEffectContext): void {
  if (ctx.evaded || !ctx.defenderCardId) return;
  const defender = findDefender(ctx);
  if (!defender) return;
  defender.status_effects = addOrRefreshEffect(defender.status_effects ?? [], {
    type: 'paralyzed',
    remaining_turns: 1,
    source: { card_instance_id: ctx.attackerCardId, player: ctx.playerNumber, type: 'passive' },
  });
}

function applyDragonRageCleave(ctx: BasicAttackEffectContext): void {
  if (ctx.evaded || !ctx.defenderCardId) return;
  const defenderPlayer = ctx.playerNumber === 1 ? ctx.engineCtx.state.player2 : ctx.engineCtx.state.player1;
  const defIdx = defenderPlayer.field_knights.findIndex((c: CardInGameState) => c.instance_id === ctx.defenderCardId);
  if (defIdx < 0) return;

  const adjacents = [
    defenderPlayer.field_knights[defIdx - 1],
    defenderPlayer.field_knights[defIdx + 1],
  ].filter((c): c is CardInGameState => c != null);

  for (const adjacent of adjacents) {
    const adjacentDamage = Math.max(1, (ctx.attacker.ce ?? 0) - (adjacent.ar ?? 0));
    applyDamage(ctx.engineCtx, adjacent.instance_id, adjacentDamage, ctx.attackerCardId);
  }
}

export function applyBasicAttackSideEffects(ctx: BasicAttackEffectContext): void {
  const hadElectricCharge = attackerHasElectricCharge(ctx.attacker.status_effects ?? []);
  const hadDragonRage = attackerHasDragonRage(ctx.attacker.status_effects ?? []);

  // Consumir primero los one-shot; la aplicación usa los flags capturados arriba.
  ctx.attacker.status_effects = consumeBasicAttackEffects(ctx.attacker.status_effects ?? []);

  if (hadElectricCharge) {
    applyParalyzeOnHit(ctx);
  }
  if (hadDragonRage) {
    applyDragonRageCleave(ctx);
  }
}
