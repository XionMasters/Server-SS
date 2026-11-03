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
 * Si la carta es única y ya hay un caballero de ese personaje en el campo de su dueño
 * (rules/unique.rules), la invocación se cancela y la carta vuelve a su zona.
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
import { findUniqueConflict } from '../rules/unique.rules';

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

  // ── Buscar la carta según la zona de origen ───────────────────────────
  let card: any = null;
  let cardPlayer: any = null;

  for (const player of [state.player1, state.player2]) {
    // Para yomotsu: buscar en graveyard[] (fuente de verdad)
    if (fromZone === 'yomotsu') {
      if (!Array.isArray(player.graveyard)) player.graveyard = [];
      const gravIdx = player.graveyard.findIndex((c: any) => c.instance_id === cardId);
      if (gravIdx !== -1) {
        card = player.graveyard.splice(gravIdx, 1)[0];
        // También quitar de passive_watchers si estaba ahí (cartas con pasivas reactivas)
        const pwIdx = player.passive_watchers.findIndex((c: any) => c.instance_id === cardId);
        if (pwIdx !== -1) player.passive_watchers.splice(pwIdx, 1);
        cardPlayer = player;
        break;
      }
    } else {
      // Para deck/cositos: buscar en passive_watchers (pre-cargado por el servicio)
      const idx = player.passive_watchers.findIndex((c: any) => c.instance_id === cardId);
      if (idx !== -1) {
        card = player.passive_watchers.splice(idx, 1)[0];
        cardPlayer = player;
        break;
      }
    }
  }

  // Guard: carta no encontrada — no-op
  if (!card || !cardPlayer) return;

  const abort = () => {
    if (fromZone === 'yomotsu') {
      if (!Array.isArray(cardPlayer.graveyard)) cardPlayer.graveyard = [];
      cardPlayer.graveyard.push(card);
    } else {
      cardPlayer.passive_watchers.push(card);
    }
  };

  // Carta única: si ya hay un caballero de ese personaje en el campo, no entra
  if (findUniqueConflict(cardPlayer.field_knights, card)) {
    abort();
    return;
  }

  // ── Resolver posición libre ─────────────────────────────────────────────
  // Si la posición solicitada está ocupada, buscar la primera libre (0–4).
  const occupiedPositions = new Set(
    cardPlayer.field_knights.map((c: any) => c.position),
  );
  let finalPosition = position;
  if (occupiedPositions.has(finalPosition)) {
    const free = [0, 1, 2, 3, 4].find(p => !occupiedPositions.has(p));
    if (free === undefined) {
      // Campo lleno (5/5) — devolver la carta a su zona y abortar
      abort();
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
    cardPlayer.graveyard_count = Math.max(0, (cardPlayer.graveyard ?? []).length);
  } else if (fromZone === 'cositos') {
    cardPlayer.costos_count = Math.max(0, (cardPlayer.costos_count ?? 0) - 1);
  } else if (fromZone === 'deck') {
    // deck_count se persiste en matches.playerN_deck_size: hay que descontarlo aquí
    cardPlayer.deck_count = Math.max(0, (cardPlayer.deck_count ?? 0) - 1);
  }

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
