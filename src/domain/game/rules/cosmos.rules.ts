/**
 * Cosmo del jugador: nunca baja de 0 ni supera BASE_MATCH_RULES.max_cosmos (12).
 * Todo lo que suma o resta cosmo al jugador debe pasar por aquí.
 */
import { BASE_MATCH_RULES } from './base.rules';

export const MAX_PLAYER_COSMOS = BASE_MATCH_RULES.max_cosmos;

export function clampPlayerCosmos(value: number): number {
  return Math.min(MAX_PLAYER_COSMOS, Math.max(0, Math.trunc(value || 0)));
}

/** Suma (o resta) cosmo al jugador respetando los límites. Devuelve el cambio real aplicado. */
export function addPlayerCosmos(player: { cosmos: number }, delta: number): number {
  const before = player.cosmos ?? 0;
  player.cosmos = clampPlayerCosmos(before + delta);
  return player.cosmos - before;
}

export function isPlayerCosmosFull(cosmos: number | null | undefined): boolean {
  return (cosmos ?? 0) >= MAX_PLAYER_COSMOS;
}
