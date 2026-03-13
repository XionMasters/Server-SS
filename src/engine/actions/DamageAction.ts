/**
 * DamageAction.ts
 *
 * Única puerta de entrada para aplicar daño a una carta en juego.
 *
 * Llamado por:
 *   - AttackRulesEngine (BA, mod. defensa/evasión)
 *   - ActionRegistry (acción declarativa "apply_damage" desde habilidades)
 *   - Efectos de veneno / BRN (burn) al inicio de turno (futuro)
 *   - Técnicas de daño directo
 *
 * Secuencia:
 *   1. Reducir current_health de la carta.
 *   2. Emitir DAMAGE_DEALT.
 *   3. Si current_health <= 0 → emitir DAMAGE_LETHAL → llamar killKnight().
 *
 * 100% puro: sin await, sin BD.
 */

import type { EngineContext } from '../EngineContext';
import type { CardInGameState } from '../GameState';
import { createEvent } from '../events/GameEvents';
import { killKnight } from './KillAction';

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

// ─── applyDamage ──────────────────────────────────────────────────────────────

/**
 * Aplica daño a una carta.
 *
 * Si el daño es letal (HP cae a 0), llama a killKnight() que:
 *  - Mueve la carta al yomotsu.
 *  - Añade a passive_watchers si tiene reactive passives.
 *  - Emite KNIGHT_DIED y ALLY_DIED.
 *
 * @param ctx          Contexto de ejecución del motor.
 * @param targetCardId instance_id de la carta que recibe el daño.
 * @param amount       Puntos de daño (ya calculados, sin AR).
 * @param sourceCardId instance_id de la carta/habilidad que causó el daño (para chainId / animación).
 */
export function applyDamage(
  ctx: EngineContext,
  targetCardId: string,
  amount: number,
  sourceCardId?: string,
): void {
  const card = findCardInField(ctx, targetCardId);
  if (!card) {
    throw new Error(`[applyDamage] Carta "${targetCardId}" no encontrada en campo`);
  }

  const actualDamage = Math.max(0, amount);
  card.current_health -= actualDamage;

  // DAMAGE_DEALT siempre, independientemente de si es letal
  ctx.bus.emit(
    createEvent({
      type: 'DAMAGE_DEALT',
      playerNumber: card.player_number,
      sourceCardId,
      targetCardId,
      origin: 'system',
      payload: { amount: actualDamage, instanceId: targetCardId },
    }),
  );

  if (card.current_health <= 0) {
    ctx.bus.emit(
      createEvent({
        type: 'DAMAGE_LETHAL',
        playerNumber: card.player_number,
        sourceCardId,
        targetCardId,
        origin: 'system',
        payload: { amount: actualDamage, instanceId: targetCardId },
      }),
    );
    killKnight(ctx, targetCardId, sourceCardId);
  }
}
