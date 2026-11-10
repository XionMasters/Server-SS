/**
 * Caballeros jugados por turno.
 *
 * Cada jugador puede jugar UN caballero desde la mano por turno
 * (BASE_MATCH_RULES.turn.knights_per_turn). Una habilidad puede permitir jugar más ese turno
 * con la acción `grant_extra_knight_play` (ActionRegistry), que suma a `extra_knight_plays`.
 *
 * Solo cuenta jugar un caballero desde la mano (PLAY_CARD). Las invocaciones por habilidad
 * (summon_from_zone, resurrecciones…) no gastan ni necesitan este cupo.
 *
 * Los contadores viven en Player y se persisten en matches.turn_counters (JSONB, migración 015).
 * Al cambiar de turno se ponen a cero para los dos jugadores (TurnRulesEngine.endTurn): los
 * permisos extra no sobreviven al turno en que se conceden.
 */

import { BASE_MATCH_RULES } from './base.rules';

export const KNIGHT_PLAY_LIMIT_ERROR = 'Ya jugaste un caballero este turno';

export interface KnightPlayCounters {
  /** Caballeros jugados desde la mano en el turno actual. */
  knights_played_this_turn?: number;
  /** Caballeros adicionales que una habilidad permite jugar este turno. */
  extra_knight_plays?: number;
}

const toCount = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Caballeros que el jugador puede jugar en total este turno. */
export function knightPlaysAllowed(player: KnightPlayCounters): number {
  return BASE_MATCH_RULES.turn.knights_per_turn + toCount(player.extra_knight_plays);
}

/** Caballeros que aún puede jugar este turno. */
export function knightPlaysLeft(player: KnightPlayCounters): number {
  return Math.max(0, knightPlaysAllowed(player) - toCount(player.knights_played_this_turn));
}

export function canPlayKnightThisTurn(player: KnightPlayCounters): boolean {
  return knightPlaysLeft(player) > 0;
}

/** Registra que el jugador jugó un caballero desde la mano. */
export function registerKnightPlayed(player: KnightPlayCounters): void {
  player.knights_played_this_turn = toCount(player.knights_played_this_turn) + 1;
}

/** Permite jugar `amount` caballeros más este turno. */
export function grantExtraKnightPlays(player: KnightPlayCounters, amount = 1): void {
  player.extra_knight_plays = toCount(player.extra_knight_plays) + toCount(amount);
}

export function resetKnightPlays(player: KnightPlayCounters): void {
  player.knights_played_this_turn = 0;
  player.extra_knight_plays = 0;
}

// ─── Persistencia (matches.turn_counters) ─────────────────────────────────────

interface StoredCounters {
  knights_played?: number;
  extra_knight_plays?: number;
}

/** Formato de la columna: { player1: { knights_played, extra_knight_plays }, player2: {...} } */
export interface StoredTurnCounters {
  player1?: StoredCounters;
  player2?: StoredCounters;
}

function parseStored(raw: unknown): StoredTurnCounters {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return {}; }
  }
  return value && typeof value === 'object' ? (value as StoredTurnCounters) : {};
}

/** Contadores de un jugador leídos de la columna matches.turn_counters. */
export function readKnightPlayCounters(raw: unknown, playerNumber: 1 | 2): Required<KnightPlayCounters> {
  const stored = parseStored(raw)[playerNumber === 1 ? 'player1' : 'player2'] ?? {};
  return {
    knights_played_this_turn: toCount(stored.knights_played),
    extra_knight_plays: toCount(stored.extra_knight_plays),
  };
}

/** Valor de la columna matches.turn_counters a partir de los dos jugadores. */
export function toStoredTurnCounters(
  player1: KnightPlayCounters,
  player2: KnightPlayCounters,
): StoredTurnCounters {
  const store = (p: KnightPlayCounters): StoredCounters => ({
    knights_played: toCount(p.knights_played_this_turn),
    extra_knight_plays: toCount(p.extra_knight_plays),
  });
  return { player1: store(player1), player2: store(player2) };
}
