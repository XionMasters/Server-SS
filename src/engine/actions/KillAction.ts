/**
 * KillAction.ts
 *
 * Única puerta de entrada para eliminar un caballero del campo.
 *
 * Responsabilidades:
 *  1. Retirar la carta de field_knights del jugador propietario.
 *  2. Cambiar su zona a 'yomotsu' e incrementar graveyard_count.
 *  3. Si tiene triggers pasivos reactivos → moverla a passive_watchers
 *     para que pueda reaccionar a su propia muerte (Ikki Phoenix, etc.).
 *  4. Resolver condición de victoria.
 *  5. Emitir KNIGHT_DIED (sin filtro de perspectiva — cualquier carta reacciona).
 *  6. Emitir ALLY_DIED  (filtro 'same' — solo el equipo del muerto reacciona).
 *
 * Llamado desde:
 *   - DamageAction.applyDamage() cuando HP cae a 0.
 *   - KnightRulesEngine.sacrificeKnight() (futuro: directamente aquí).
 *   - Efectos de CardsManager que eliminan cartas sin pasar por combate.
 *
 * 100% puro: sin await, sin BD.
 */

import type { EngineContext } from '../EngineContext';
import { resolveWinCondition } from '../GameState';
import { createEvent } from '../events/GameEvents';

/**
 * Elimina una carta del campo y emite los eventos de muerte.
 * Si la carta no está en field_knights (ya fue eliminada), no hace nada (guard).
 */
export function killKnight(
  ctx: EngineContext,
  cardId: string,
  sourceCardId?: string,
): void {
  const { state } = ctx;

  // Buscar la carta en field_knights de ambos jugadores
  let card: any = null;
  let cardPlayer: any = null;

  for (const player of [state.player1, state.player2]) {
    const idx = player.field_knights.findIndex((c: any) => c.instance_id === cardId);
    if (idx !== -1) {
      card = player.field_knights[idx];
      cardPlayer = player;
      // 1. Retirar del campo
      player.field_knights.splice(idx, 1);
      break;
    }
  }

  // Guard: carta no encontrada (ya muerta o no era knight)
  if (!card || !cardPlayer) return;

  // 2. Actualizar contadores de zona
  card.zone = 'yomotsu';
  cardPlayer.graveyard_count += 1;

  // 3. Mover a passive_watchers si tiene triggers reactivos
  //    Así la carta puede responder a su propia muerte (p.ej. Ikki).
  const hasReactivePassives = (card.raw_abilities ?? []).some(
    (a: any) =>
      a.type === 'pasiva' &&
      a.effects?.trigger !== 'CARD_PLAYED' &&
      a.effects?.trigger !== 'ACTIVE',
  );
  if (hasReactivePassives) {
    cardPlayer.passive_watchers.push(card);
  }

  // 4. Resolver condición de victoria (podría terminar el juego aquí)
  resolveWinCondition(state);

  // 5. KNIGHT_DIED — sin filtro de perspectiva: cualquier carta puede reaccionar
  ctx.bus.emit(
    createEvent({
      type: 'KNIGHT_DIED',
      playerNumber: card.player_number,
      sourceCardId,
      targetCardId: cardId,
      origin: 'system',
      payload: { instanceId: cardId, owner: card.player_number, card_code: card.card_code },
    }),
  );

  // 6. ALLY_DIED — filtro 'same': solo el equipo del caballero caído reacciona
  ctx.bus.emit(
    createEvent({
      type: 'ALLY_DIED',
      playerNumber: card.player_number,
      sourceCardId,
      targetCardId: cardId,
      origin: 'system',
      payload: { instanceId: cardId, owner: card.player_number, card_code: card.card_code },
    }),
  );
}
