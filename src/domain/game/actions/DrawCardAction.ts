/**
 * DrawCardAction.ts
 *
 * Única puerta de entrada para "robar carta" en el estado puro del motor.
 *
 * Responsabilidades del motor puro:
 *  - Decrementar deck_count del jugador.
 *  - Emitir ALLY_DREW_CARD   (mismo equipo → filtro 'same' en PassiveTriggerEngine).
 *  - Emitir OPPONENT_DREW_CARD (equipo rival → filtro 'opposite').
 *
 * Responsabilidad del service layer (NO aquí):
 *  - Mover CardInPlay de zona 'deck' a 'hand' en la BD.
 *  - Obtener el cardId real (desde CardDrawService).
 *
 * Flujo en TurnManager:
 *   1. CardDrawService.drawCard() → obtiene drawnCard de BD
 *   2. drawCardState(ctx, nextPlayer, drawnCard?.id) → decrementa + emite events
 *
 * 100% puro: sin await, sin BD.
 */

import type { EngineContext } from '../EngineContext';
import { createEvent } from '../events/GameEvents';

/**
 * Refleja en el GameState que un jugador robó una carta y emite los eventos.
 *
 * @param ctx           Contexto de ejecución del motor.
 * @param playerNumber  Jugador que roba la carta.
 * @param cardId        ID de la carta robada (opcional — el servicio lo pasa cuando lo tiene).
 */
export function drawCardState(
  ctx: EngineContext,
  playerNumber: 1 | 2,
  cardId?: string,
): void {
  const player = playerNumber === 1 ? ctx.state.player1 : ctx.state.player2;

  if (player.deck_count > 0) {
    player.deck_count -= 1;
  }

  const remainingDeck = player.deck_count;

  // ALLY_DREW_CARD: perspectiva del jugador que robó → 'same' filter en PassiveTriggerEngine
  ctx.bus.emit(
    createEvent({
      type: 'ALLY_DREW_CARD',
      playerNumber,
      origin: 'system',
      payload: { cardId: cardId ?? '', remainingDeck },
    }),
  );

  // OPPONENT_DREW_CARD: perspectiva del rival → 'opposite' filter en PassiveTriggerEngine
  // PlayerNumber es el mismo (el que robó) — PERSPECTIVE_FILTER usa 'opposite' para filtrar
  ctx.bus.emit(
    createEvent({
      type: 'OPPONENT_DREW_CARD',
      playerNumber,
      origin: 'system',
      payload: { remainingDeck },
    }),
  );
}
