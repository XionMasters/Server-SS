/**
 * PassiveTriggerEngine.ts
 *
 * Despacha habilidades pasivas en respuesta a eventos del juego.
 *
 * A diferencia de AbilityEngine (que ejecuta UNA habilidad específica),
 * este motor itera TODAS las zonas del estado buscando cartas con passives
 * cuyo trigger coincida con el evento recibido.
 *
 * ── Zonas revisadas ──────────────────────────────────────────────────────────
 *   Campo (field_knights, field_techniques, field_helper, field_occasion)
 *   Cartas fuera del campo (passive_watchers): yomotsu, mazo, etc.
 *   → Ejemplos canónicos:
 *       Ikki en yomotsu → trigger KNIGHT_DIED (¿es el caballero con phoenix_rebirth?)
 *       Shun en mazo    → trigger ALLY_DIED   (condición: ally_code === 'ikki_phoenix')
 *
 * ── Filtro de perspectiva ────────────────────────────────────────────────────
 *   Algunos eventos son relativos al observador (ALLY_DREW_CARD, OPPONENT_DREW_CARD).
 *   PERSPECTIVE_FILTER define qué cartas pueden reaccionar a cada uno:
 *     'same'     → solo cartas del mismo jugador que event.playerNumber
 *     'opposite' → solo cartas del jugador contrario
 *   Si un evento no está en el mapa, todas las cartas de ambos jugadores reaccionan.
 *
 * ── Para añadir soporte a un nuevo evento ────────────────────────────────────
 *   1. Añadir el evento en GameEvents.ts
 *   2. Si es perspectiva-relativo, añadirlo a PERSPECTIVE_FILTER abajo
 *   3. Crear la carta con el trigger en la DB (effects.trigger = 'MI_EVENTO')
 *   4. El motor lo despachará automáticamente sin cambios adicionales
 */

import { GameState, CardInGameState } from './GameState';
import type { EngineContext } from './EngineContext';
import { GameEvent, GameEventType } from './events/GameEvents';
import { AbilityEngine } from './abilities/AbilityEngine';

// ─── Filtro de perspectiva ────────────────────────────────────────────────────

/**
 * Define qué cartas pueden reaccionar a eventos relativos al observador.
 *   'same'     → solo el equipo del playerNumber del evento
 *   'opposite' → solo el equipo contrario al playerNumber del evento
 *   Sin entrada → todas las cartas de ambos jugadores pueden reaccionar
 */
const PERSPECTIVE_FILTER: Partial<Record<GameEventType, 'same' | 'opposite'>> = {
  ALLY_DREW_CARD:     'same',      // "mi aliado robó"       → equipo que robó
  OPPONENT_DREW_CARD: 'opposite',  // "mi oponente robó"     → equipo contrario al que robó
  ALLY_DIED:          'same',      // "mi aliado murió"      → equipo del caballero caído
  // KNIGHT_DIED sin filtro: cualquier carta puede reaccionar (incluyendo enemigos)
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getAllFieldCards(state: GameState): CardInGameState[] {
  return [
    ...state.player1.field_knights,
    ...state.player1.field_techniques,
    ...(state.player1.field_helper   ? [state.player1.field_helper]   : []),
    ...(state.player1.field_occasion ? [state.player1.field_occasion] : []),
    ...state.player2.field_knights,
    ...state.player2.field_techniques,
    ...(state.player2.field_helper   ? [state.player2.field_helper]   : []),
    ...(state.player2.field_occasion ? [state.player2.field_occasion] : []),
  ];
}

function getAllPassiveWatchers(state: GameState): CardInGameState[] {
  return [
    ...state.player1.passive_watchers,
    ...state.player2.passive_watchers,
  ];
}

function isPerspectiveAllowed(
  card: CardInGameState,
  event: GameEvent,
): boolean {
  const filter = PERSPECTIVE_FILTER[event.type];
  if (!filter) return true; // Sin filtro: todas las cartas reaccionan

  if (filter === 'same')     return card.player_number === event.playerNumber;
  if (filter === 'opposite') return card.player_number !== event.playerNumber;
  return true;
}

// ─── Motor ────────────────────────────────────────────────────────────────────

export const PassiveTriggerEngine = {
  /**
   * Dispara todas las habilidades pasivas cuyo trigger coincide con el evento dado.
   *
   * Opera directamente sobre ctx.state (ya es un clon — no necesita clonar de nuevo).
   * Los nuevos eventos generados por passivas se emiten al ctx.bus, que puede encadenar
   * más passivas (depth controla la profundidad máxima del bus).
   *
   * @param ctx    Contexto de ejecución compartido con toda la cadena.
   * @param event  Evento que disparó esta evaluación.
   * @param depth  Profundidad de encadenamiento actual (0 = nivel raíz del bus).
   */
  fireEvent(
    ctx: EngineContext,
    event: GameEvent,
    depth = 0,
  ): void {
    // Snapshot de cartas ANTES de iterar: la misma pasiva no debe reaccionar
    // a eventos causados por ella misma en la misma cadena de llamadas.
    const allCards = [
      ...getAllFieldCards(ctx.state),
      ...getAllPassiveWatchers(ctx.state),
    ];

    for (const card of allCards) {
      if (!card.raw_abilities || card.raw_abilities.length === 0) continue;
      if (!isPerspectiveAllowed(card, event)) continue;

      for (const rawAbility of card.raw_abilities) {
        // Solo pasivas — las activas requieren acción explícita del jugador
        if (rawAbility.type !== 'pasiva') continue;

        const def = rawAbility.effects;
        if (def.trigger !== event.type) continue;

        try {
          // Validar condiciones antes de ejecutar
          const check = AbilityEngine.canActivate(
            def,
            ctx.state,
            card.player_number,
            card.instance_id,
            event,
          );
          if (!check.valid) continue;

          // Ejecutar usando el ctx compartido para que los eventos fluyan al mismo bus
          AbilityEngine.execute(
            def,
            ctx.state,
            card.player_number,
            card.instance_id,
            event,
            ctx,
          );

          console.log(
            `[PassiveTriggerEngine] "${rawAbility.ability_key ?? card.card_code}" ` +
            `(${card.card_code} zona:${card.zone} depth:${depth}) disparado por ${event.type}`,
          );
        } catch (err) {
          // Una pasiva que falla no aborta las demás
          console.warn(
            `[PassiveTriggerEngine] Error al ejecutar pasiva "${rawAbility.ability_key}" ` +
            `de carta ${card.card_code}:`,
            err,
          );
        }
      }
    }
  },
};
