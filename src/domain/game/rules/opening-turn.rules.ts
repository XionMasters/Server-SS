/**
 * Primer turno de la partida: quien empieza no puede atacar al jugador rival
 * (ataque básico o técnica directos), porque el rival aún no ha tenido turno para defenderse.
 * Atacar caballeros sí está permitido.
 *
 * El contador de turnos solo sube cuando vuelve a jugar el jugador 1, así que el primer turno
 * es el turno 1 del jugador que empezó (`first_player`, columna matches.first_player).
 * Si no se sabe quién empezó (estados construidos a mano), no se restringe nada.
 */
import type { GameState } from '../GameState';

export const OPENING_TURN_DIRECT_ATTACK_ERROR =
  'En el primer turno de la partida no puedes atacar al jugador rival';

export function isOpeningTurn(
  state: Pick<GameState, 'current_turn' | 'current_player'> & { first_player?: number | null },
): boolean {
  if (state.first_player !== 1 && state.first_player !== 2) return false;
  return Number(state.current_turn) === 1 && Number(state.current_player) === state.first_player;
}
