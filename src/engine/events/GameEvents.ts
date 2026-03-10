/**
 * GameEvents.ts
 *
 * Tipos de eventos del motor de juego.
 *
 * AbilityDefinition usa estos mismos valores como triggers:
 *   { "trigger": "CARD_PLAYED", "actions": [...] }
 *   { "trigger": "ALLY_DIED",   "actions": [...] }  ← Fase 3 (EventBus)
 *
 * AbilityTrigger en AbilityDefinition.ts se deriva de GameEventType,
 * por lo que añadir un valor aquí lo expone automáticamente como trigger.
 */

// ─── Event type enum ─────────────────────────────────────────────────────────

export const GameEventType = {
  ACTIVE:         'ACTIVE',         // Habilidad activada manualmente por el jugador
  CARD_PLAYED:    'CARD_PLAYED',    // Carta jugada desde la mano al campo
  TURN_START:     'TURN_START',     // Inicio del turno
  TURN_END:       'TURN_END',       // Fin del turno
  // KNIGHT_DIED y ALLY_DIED comparten estructura; usa payload.owner para distinguir.
  // ALLY_DIED se puede derivar: owner === playerNumber → aliado, de lo contrario → enemigo.
  KNIGHT_DIED:    'KNIGHT_DIED',    // Caballero eliminado (cualquier jugador)
  ALLY_DIED:      'ALLY_DIED',      // Alias semántico — aliado del emisor eliminado
  DAMAGE_DEALT:   'DAMAGE_DEALT',   // Daño aplicado a un caballero
  DAMAGE_LETHAL:  'DAMAGE_LETHAL',  // Daño letal (reduce HP a 0)
} as const;

export type GameEventType = typeof GameEventType[keyof typeof GameEventType];

// ─── Typed payload map ───────────────────────────────────────────────────────
//
// Cada evento tiene un payload estructurado. Cuando el tipo no importa
// (ej. GameEvent sin parámetro) el payload es la unión de todos.

export interface EventPayloadMap {
  ACTIVE:        { cost?: number };
  CARD_PLAYED:   { zone: string; position: number };
  TURN_START:    { turn: number };
  TURN_END:      { turn: number };
  KNIGHT_DIED:   { instanceId: string; owner: 1 | 2 };
  ALLY_DIED:     { instanceId: string; owner: 1 | 2 };
  DAMAGE_DEALT:  { amount: number; instanceId: string; isCrit?: boolean };
  DAMAGE_LETHAL: { amount: number; instanceId: string };
}

/** Payload tipado para el evento T. Cae a `Record<string, unknown>` si T es la unión completa. */
export type EventPayload<T extends GameEventType> =
  T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;

// ─── Game event ──────────────────────────────────────────────────────────────

/**
 * GameEvent<T> — evento inmutable emitido por el motor.
 *
 * Uso genérico (evento específico):
 *   const evt: GameEvent<'DAMAGE_DEALT'> = {
 *     type: 'DAMAGE_DEALT', playerNumber: 1,
 *     payload: { amount: 5, instanceId: '...' },  // estrictamente tipado
 *   };
 *
 * Uso sin parámetro (aceptar cualquier evento):
 *   function handle(evt: GameEvent) { ... }  // payload = unión de todos
 */
export interface GameEvent<T extends GameEventType = GameEventType> {
  type: T;
  playerNumber: 1 | 2;
  /** ID de la partida — útil para logs, replay y modo espectador. */
  matchId?: string;
  /** instance_id de la carta que origina el evento. */
  sourceCardId?: string;
  /** instance_id elegido por el cliente (objetivo, carta a descartar, etc.). */
  targetCardId?: string;
  /** Unix ms — para debugging y replay secuencial. */
  timestamp?: number;
  /**
   * Encadena eventos relacionados bajo un mismo ID.
   * Permite rastrear: CARD_PLAYED → DAMAGE_DEALT → KNIGHT_DIED con el mismo chainId.
   */
  chainId?: string;
  /** Distingue acciones del jugador de efectos disparados por el sistema. */
  origin?: 'player' | 'system';
  /** Datos estructurados del evento. Tipado automáticamente según T. */
  payload?: EventPayload<T>;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Crea un GameEvent con `timestamp` auto-completado.
 * Usar cuando se emite un evento nuevo (no en re-construcción desde BD).
 */
export function createEvent<T extends GameEventType>(
  fields: Omit<GameEvent<T>, 'timestamp'> & { timestamp?: number },
): GameEvent<T> {
  return { timestamp: Date.now(), ...fields };
}
