/**
 * SummonAction.ts
 *
 * Única puerta de entrada para convocar un caballero al campo desde fuera del juego activo.
 *
 * Casos cubiertos:
 *   - 'yomotsu'  → carta en passive_watchers (puesta ahí por killKnight si tenía pasivas reactivas)
 *   - 'cositos'  → carta en passive_watchers (mismo mecanismo, zona diferente)
 *   - 'deck'     → carta en passive_watchers pre-cargada por MatchStateMapper
 *                  (Shun Andromeda: mazo = passive_watcher con trigger ALLY_DIED)
 *
 * La carta se busca SIEMPRE en passive_watchers del estado.
 * Si no se encuentra ahí, la invocación es un no-op (guard).
 *
 * Post-condiciones:
 *   - La carta pasa de passive_watchers a field_knights en el GameState.
 *   - zone = 'field_knight', position = posición asignada.
 *   - graveyard_count decrementado si from_zone === 'yomotsu'.
 *   - costos_count decrementado si from_zone === 'cositos'.
 *   - KNIGHT_SUMMONED emitido (todos los jugadores ven la invocación).
 *   - ALLY_SUMMONED emitido (solo el equipo del convocado reacciona, igual que ALLY_DIED).
 *
 * 100% puro: sin await, sin BD.
 * La BD se sincroniza automáticamente vía MatchRepository.applyState():
 *   applyState detecta que la carta pasó a field_knights y actualiza zone+position.
 */

import type { EngineContext } from '../EngineContext';
import { createEvent } from '../events/GameEvents';

export type SummonFromZone = 'yomotsu' | 'deck' | 'cositos';

/**
 * Convoca un caballero desde passive_watchers al campo.
 *
 * @param ctx        Contexto del motor (state + bus)
 * @param cardId     instance_id del CardInPlay a convocar
 * @param position   Posición en field_knights (0–4). Si está ocupada, se usa la primera libre.
 * @param fromZone   Zona de origen declarada (para el payload del evento)
 */
export function summonKnight(
  ctx: EngineContext,
  cardId: string,
  position: number,
  fromZone: SummonFromZone,
): void {
  const { state } = ctx;

  // ── Buscar en passive_watchers ──────────────────────────────────────────
  let card: any = null;
  let cardPlayer: any = null;

  for (const player of [state.player1, state.player2]) {
    const idx = player.passive_watchers.findIndex((c: any) => c.instance_id === cardId);
    if (idx !== -1) {
      card = player.passive_watchers.splice(idx, 1)[0];
      cardPlayer = player;
      break;
    }
  }

  // Guard: carta no encontrada en passive_watchers — no-op
  if (!card || !cardPlayer) return;

  // ── Resolver posición libre ─────────────────────────────────────────────
  // Si la posición solicitada está ocupada, buscar la primera libre (0–4).
  const occupiedPositions = new Set(
    cardPlayer.field_knights.map((c: any) => c.position),
  );
  let finalPosition = position;
  if (occupiedPositions.has(finalPosition)) {
    const free = [0, 1, 2, 3, 4].find(p => !occupiedPositions.has(p));
    if (free === undefined) {
      // Campo lleno (5/5) — devolver la carta a passive_watchers y abortar
      cardPlayer.passive_watchers.push(card);
      return;
    }
    finalPosition = free;
  }

  // ── Actualizar la carta y colocarla en campo ────────────────────────────
  card.zone = 'field_knight';
  card.position = finalPosition;
  cardPlayer.field_knights.push(card);

  // ── Actualizar contadores de zona origen ───────────────────────────────
  if (fromZone === 'yomotsu') {
    cardPlayer.graveyard_count = Math.max(0, (cardPlayer.graveyard_count ?? 0) - 1);
  } else if (fromZone === 'cositos') {
    cardPlayer.costos_count = Math.max(0, (cardPlayer.costos_count ?? 0) - 1);
  }
  // 'deck': deck_count lo decrementa DrawCardAction; aquí no tocamos nada más.

  // ── Emitir KNIGHT_SUMMONED ─────────────────────────────────────────────
  // Sin filtro de perspectiva — cualquier carta puede reaccionar a una invocación rival.
  ctx.bus.emit(
    createEvent({
      type: 'KNIGHT_SUMMONED',
      playerNumber: card.player_number,
      sourceCardId: cardId,
      origin: 'system',
      payload: {
        instanceId: cardId,
        card_code: card.card_code,
        owner: card.player_number,
        from_zone: fromZone,
        position: finalPosition,
      },
    }),
  );
}
