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

// 📖 CATÁLOGO: los valores de este objeto están documentados en src/views/admin.html
//   buscar: "⚡ Triggers" — actualizar el catálogo al agregar un nuevo evento.
export const GameEventType = {
  ACTIVE:         'ACTIVE',         // Habilidad activada manualmente por el jugador
  CARD_PLAYED:    'CARD_PLAYED',    // Carta jugada desde la mano al campo
  ATTACK_CONNECTED: 'ATTACK_CONNECTED', // Un ataque conecta (no evadido). Distinto de DAMAGE_DEALT: describe el resultado del ataque completo
  TURN_START:     'TURN_START',     // Inicio del turno
  TURN_END:       'TURN_END',       // Fin del turno
  KNIGHT_DIED:    'KNIGHT_DIED',    // Caballero eliminado (cualquier jugador)
  ALLY_DIED:      'ALLY_DIED',      // Alias semántico — aliado del emisor eliminado
  DAMAGE_DEALT:   'DAMAGE_DEALT',   // Daño aplicado a un caballero
  DAMAGE_LETHAL:  'DAMAGE_LETHAL',  // Daño letal (reduce HP a 0)
  HEAL_RECEIVED:      'HEAL_RECEIVED',      // Curación recibida por un caballero
  ALLY_DREW_CARD:     'ALLY_DREW_CARD',     // El jugador activo roba una carta del mazo
  OPPONENT_DREW_CARD: 'OPPONENT_DREW_CARD', // El oponente roba una carta del mazo
  COSMOS_CHARGED:     'COSMOS_CHARGED',     // Jugador usa "Cargar Cosmo" (+CP)
  KNIGHT_SUMMONED:    'KNIGHT_SUMMONED',    // Caballero convocado desde yomotsu/mazo/cositos
  SELECTION_RESOLVED: 'SELECTION_RESOLVED', // Jugador resolvió una selección interactiva (request_selection)
} as const;

export type GameEventType = typeof GameEventType[keyof typeof GameEventType];

// ─── Typed payload map ───────────────────────────────────────────────────────
//
// Cada evento tiene un payload estructurado. Cuando el tipo no importa
// (ej. GameEvent sin parámetro) el payload es la unión de todos.

export interface EventPayloadMap {
  ACTIVE:        { cost?: number };
  CARD_PLAYED:   { zone: string; position: number };
  ATTACK_CONNECTED: {
    attack_type: 'BA' | 'TA';
    damage_to_card: number;
    damage_to_player: number;
    defender_card_id?: string;
  };
  TURN_START:    { turn: number };
  TURN_END:      { turn: number };
  KNIGHT_DIED:   {
    instanceId: string;
    owner: 1 | 2;
    card_code: string;
    death_reason?: 'damage' | 'effect' | 'sacrifice';
  };
  ALLY_DIED:     {
    instanceId: string;
    owner: 1 | 2;
    card_code: string;
    death_reason?: 'damage' | 'effect' | 'sacrifice';
  };
  DAMAGE_DEALT:  {
    amount: number;
    instanceId: string;
    isCrit?: boolean;
    target_current_health?: number;
    target_max_health?: number;
    target_health_pct?: number;
  };
  DAMAGE_LETHAL:     { amount: number; instanceId: string };
  HEAL_RECEIVED:      { amount: number; instanceId: string };
  ALLY_DREW_CARD:     { cardId: string; remainingDeck: number };
  OPPONENT_DREW_CARD: { remainingDeck: number }; // Sin cardId: el oponente no revela la carta robada
  COSMOS_CHARGED:     { amount: number; totalCosmos: number };
  KNIGHT_SUMMONED:    { instanceId: string; card_code: string; owner: 1 | 2; from_zone: 'yomotsu' | 'deck' | 'cositos'; position: number };
  SELECTION_RESOLVED: {
    selection_id: string;
    chosen_card_id: string;
    source_card_id: string;
    zone: string;  // zona desde la que se eligió
  };
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
