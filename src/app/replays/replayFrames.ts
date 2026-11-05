/**
 * replayFrames.ts
 *
 * Funciones puras de los fotogramas de una repetición.
 *
 * Un fotograma es el estado completo que el servidor difunde tras una acción (el matchData
 * de MatchesCoordinator, antes de separarlo por jugador), más la acción y los eventos del motor.
 * Se guarda sin perspectiva y sin lo que no hace falta para verlo (cartas del mazo, valid_actions);
 * al pedirlo se le aplica la misma visibilidad que tuvo el jugador en directo.
 */
import { applyHandVisibility } from '../matches/serializers/handVisibility';
import { filterEngineEventsForPlayer } from '../matches/serializers/engineEventsVisibility';

export interface StoredFrame {
  [key: string]: any;
  cards_in_play: any[];
  last_action: Record<string, any> | null;
  engine_events: any[];
}

/** Estado a guardar: sin cartas del mazo (el cliente usa los contadores) ni valid_actions. */
export function buildStoredFrame(
  matchData: Record<string, any>,
  lastAction: Record<string, any> | null,
  engineEvents: any[],
): StoredFrame {
  const { cards_in_play = [], ...rest } = matchData;
  return {
    ...rest,
    cards_in_play: (cards_in_play as any[])
      .filter(card => card?.zone !== 'deck')
      .map(({ valid_actions: _va, ...card }) => card),
    last_action: lastAction ?? null,
    engine_events: engineEvents ?? [],
  };
}

/**
 * Fotograma tal como lo vio un jugador: su mano visible y la del rival oculta.
 * En partidas de prueba (el mismo usuario en ambos lados) la perspectiva es la del jugador
 * activo en ese momento, igual que en directo.
 */
export function frameForViewer(frame: StoredFrame, viewerNumber: 1 | 2, isTest: boolean): Record<string, any> {
  const perspective = isTest ? (Number(frame.current_player) === 2 ? 2 : 1) : viewerNumber;
  return {
    ...frame,
    perspective_player: perspective,
    cards_in_play: applyHandVisibility(frame.cards_in_play ?? [], perspective),
    engine_events: filterEngineEventsForPlayer(frame.engine_events ?? [], perspective),
    is_replay: true,
  };
}
