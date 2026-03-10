/**
 * TargetResolver.ts
 *
 * Traduce nombres de target declarativos (strings del JSONB) a referencias reales
 * de CardInGameState dentro del GameState.
 *
 * Targets disponibles:
 *   'self'        → el caballero que activa la habilidad
 *   'target'      → la carta elegida por el cliente (event.targetCardId)
 *   'all_allies'  → todos los caballeros propios en campo
 *   'all_enemies' → todos los caballeros rivales en campo
 *
 * Para añadir un nuevo target:
 *   TargetResolver.register('nombre', fn);
 */

import type { GameState, CardInGameState } from '../GameState';
import type { GameEvent } from '../events/GameEvents';

export interface TargetContext {
  state: GameState;
  playerNumber: 1 | 2;
  sourceCardId: string;
  event: GameEvent;
}

type TargetFn = (ctx: TargetContext) => CardInGameState[];

const TARGET_REGISTRY: Record<string, TargetFn> = {
  self: ({ state, playerNumber, sourceCardId }) => {
    const player = playerNumber === 1 ? state.player1 : state.player2;
    const card = player.field_knights.find(c => c.instance_id === sourceCardId);
    return card ? [card] : [];
  },

  target: ({ state, event }) => {
    if (!event.targetCardId) return [];
    for (const player of [state.player1, state.player2]) {
      const card = player.field_knights.find(c => c.instance_id === event.targetCardId);
      if (card) return [card];
    }
    return [];
  },

  all_allies: ({ state, playerNumber }) =>
    (playerNumber === 1 ? state.player1 : state.player2).field_knights,

  all_enemies: ({ state, playerNumber }) =>
    (playerNumber === 1 ? state.player2 : state.player1).field_knights,
};

export const TargetResolver = {
  resolve(target: string, ctx: TargetContext): CardInGameState[] {
    const fn = TARGET_REGISTRY[target];
    if (!fn) throw new Error(`[TargetResolver] Target desconocido: "${target}"`);
    return fn(ctx);
  },

  register(name: string, fn: TargetFn): void {
    TARGET_REGISTRY[name] = fn;
  },
};
