/**
 * Filtra los engine_events del motor (GameEvent[]) para un jugador concreto.
 *
 *   ALLY_DREW_CARD     → solo el jugador que robó (incluye cardId)
 *   OPPONENT_DREW_CARD → solo el rival del que robó (sin cardId)
 *   resto              → ambos jugadores
 */
export function filterEngineEventsForPlayer(events: any[], forPlayerNumber: number): any[] {
  return (events ?? []).filter(evt => {
    if (evt?.type === 'ALLY_DREW_CARD') return evt.playerNumber === forPlayerNumber;
    if (evt?.type === 'OPPONENT_DREW_CARD') return evt.playerNumber !== forPlayerNumber;
    return true;
  });
}
