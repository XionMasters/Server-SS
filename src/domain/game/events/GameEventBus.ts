/**
 * GameEventBus.ts
 *
 * Bus interno del motor de juego — acumula eventos y dispara PassiveTriggerEngine
 * en cada emisión.
 *
 * Reglas de diseño:
 *   - Una instancia por ejecución (crear en createEngineContext, nunca global).
 *   - Los eventos acumulados en `events` se envían al cliente para animaciones.
 *   - Protección contra loops infinitos via MAX_EVENT_DEPTH.
 *   - No conoce persistencia, red ni Sequelize.
 *
 * Uso típico:
 *   const ctx = createEngineContext(state);
 *   applyDamage(ctx, targetId, amount);    // emite internamente
 *   return { newState: ctx.state, events: ctx.bus.events };
 */

import type { GameEvent } from './GameEvents';

// ─── Constantes ───────────────────────────────────────────────────────────────

const MAX_EVENT_DEPTH = 100;

// ─── GameEventBus ─────────────────────────────────────────────────────────────

export class GameEventBus {
  private readonly _events: GameEvent[] = [];
  private _depth = 0;

  /**
   * Callback invocado en cada emisión, DESPUÉS de acumular el evento.
   * Normalmente apunta a PassiveTriggerEngine.fireEvent(ctx, event, depth).
   * Se pasa en el constructor para evitar dependencias circulares.
   */
  private readonly _onEmit: (event: GameEvent, depth: number) => void;

  constructor(onEmit: (event: GameEvent, depth: number) => void = () => {}) {
    this._onEmit = onEmit;
  }

  /**
   * Emite un evento:
   *  1. Lo acumula en `events` (para cliente / replay).
   *  2. Llama al callback con la profundidad actual (pasiva trigger).
   *  3. Lanza EngineLoopError si se supera MAX_EVENT_DEPTH.
   */
  emit(event: GameEvent): void {
    this._events.push(event);

    if (this._depth >= MAX_EVENT_DEPTH) {
      throw new Error(
        `[GameEventBus] Bucle de eventos detectado al emitir "${event.type}". ` +
        `Profundidad máxima (${MAX_EVENT_DEPTH}) alcanzada.`,
      );
    }

    this._depth++;
    try {
      this._onEmit(event, this._depth);
    } finally {
      this._depth--;
    }
  }

  /** Todos los eventos emitidos en esta ejecución (orden cronológico). */
  get events(): readonly GameEvent[] {
    return this._events;
  }

  /** Profundidad de encadenamiento actual (0 = nivel raíz). */
  get depth(): number {
    return this._depth;
  }
}
