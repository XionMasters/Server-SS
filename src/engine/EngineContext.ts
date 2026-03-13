/**
 * EngineContext.ts
 *
 * Contexto inmutable por ejecución del motor.
 * Agrupa el estado mutable y el bus de eventos local.
 *
 * Reglas de diseño:
 *   - Crear UNA vez por acción de nivel superior (attack, playCard, useAbility…).
 *   - Pasar el mismo ctx a todas las acciones encadenadas.
 *   - Al terminar, leer ctx.state (nuevo estado) y ctx.bus.events (para broadcast).
 *   - Nunca crear ctx en un loop ni reutilizarlo entre acciones distintas.
 *
 * Ejemplo en un manager:
 *   const ctx = createEngineContext(currentState);
 *   AttackRulesEngine.attack(ctx, playerNumber, attackerId, defenderId);
 *   await MatchRepository.applyState(match, ctx.state, transaction);
 *   await broadcastEvents(matchId, ctx.bus.events);
 */

import { GameState } from './GameState';
import { GameEventBus } from './events/GameEventBus';
import type { GameEvent } from './events/GameEvents';

// ─── Interfaz ─────────────────────────────────────────────────────────────────

export interface EngineContext {
  /** Estado mutable de la partida. Las acciones del motor lo modifican directamente. */
  state: GameState;
  /** Bus de eventos local. Acumula eventos para el cliente y dispara passivas. */
  bus: GameEventBus;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Crea un EngineContext para una nueva ejecución.
 *
 * - Clona el estado con structuredClone (el original nunca se muta).
 * - Conecta el bus al PassiveTriggerEngine de forma diferida para evitar
 *   dependencias circulares en tiempo de importación.
 */
export function createEngineContext(state: GameState): EngineContext {
  // Importación diferida para romper el ciclo:
  //   EngineContext → PassiveTriggerEngine → AbilityEngine → EngineContext
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PassiveTriggerEngine } = require('./PassiveTriggerEngine') as typeof import('./PassiveTriggerEngine');

  const ctx: EngineContext = {
    state: structuredClone(state),
    bus: null!, // se asigna justo abajo
  };

  ctx.bus = new GameEventBus((event: GameEvent, depth: number) => {
    PassiveTriggerEngine.fireEvent(ctx, event, depth);
  });

  return ctx;
}
