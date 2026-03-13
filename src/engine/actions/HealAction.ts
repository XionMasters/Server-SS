/**
 * HealAction.ts
 *
 * Única puerta de entrada para curar HP a una carta en juego.
 *
 * Emite: HEAL_RECEIVED
 *
 * Nota: no hay límite de HP máximo implementado aún.
 * Cuando se añada base_health a CardInGameState, agregar el cap aquí.
 *
 * 100% puro: sin await, sin BD.
 */

import type { EngineContext } from '../EngineContext';
import type { CardInGameState } from '../GameState';
import { createEvent } from '../events/GameEvents';

// ─── Helper ───────────────────────────────────────────────────────────────────

function findCardInField(ctx: EngineContext, cardId: string): CardInGameState | null {
  const { state } = ctx;
  for (const player of [state.player1, state.player2]) {
    const found =
      player.field_knights.find(c => c.instance_id === cardId) ??
      player.field_techniques.find(c => c.instance_id === cardId) ??
      (player.field_helper?.instance_id === cardId ? player.field_helper : null) ??
      (player.field_occasion?.instance_id === cardId ? player.field_occasion : null);
    if (found) return found;
  }
  return null;
}

// ─── heal ─────────────────────────────────────────────────────────────────────

/**
 * Cura HP a una carta en campo.
 *
 * @param ctx          Contexto de ejecución del motor.
 * @param targetCardId instance_id de la carta que recibe la curación.
 * @param amount       Puntos de HP a recuperar.
 * @param sourceCardId instance_id de la carta/habilidad que cura (para animación).
 */
export function heal(
  ctx: EngineContext,
  targetCardId: string,
  amount: number,
  sourceCardId?: string,
): void {
  const card = findCardInField(ctx, targetCardId);
  if (!card) {
    throw new Error(`[heal] Carta "${targetCardId}" no encontrada en campo`);
  }

  const actualHeal = Math.max(0, amount);
  card.current_health += actualHeal;

  ctx.bus.emit(
    createEvent({
      type: 'HEAL_RECEIVED',
      playerNumber: card.player_number,
      sourceCardId,
      targetCardId,
      origin: 'system',
      payload: { amount: actualHeal, instanceId: targetCardId },
    }),
  );
}
