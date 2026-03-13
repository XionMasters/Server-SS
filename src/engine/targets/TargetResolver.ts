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
 *   'adjacent_allies' → caballeros propios adyacentes al que activa la habilidad (por ejemplo, para habilidades de soporte)
 *   'adjacent_enemies' → caballeros rivales adyacentes al que activa la habilidad (por ejemplo, para habilidades de ataque en área)
 *   'target_and_adjacent_enemies' → la carta objetivo y sus adyacentes rivales (por ejemplo, para habilidades de ataque en área dirigidas)
 *   'opponent_helper' → el ayudante del oponente (para habilidades que interactúan con el ayudante, si es que jugo uno en el slot correspondiente)
 *   'opponent_technique' → la técnica del oponente (para habilidades que interactúan con técnicas del oponente)
 *   'random_enemy' → un caballero rival aleatorio en campo (para habilidades que afectan enemigos pero no requieren un objetivo específico)
 *   'random_ally' → un caballero aliado aleatorio en campo (para habilidades de soporte que no requieren un objetivo específico)
 *   'other_allies' → todos los caballeros propios excepto el que activa la habilidad (para habilidades de soporte que no deben aplicarse a sí mismas)
*   'lowest_health_enemy' → el caballero rival con menos HP en campo (para habilidades que priorizan objetivos debilitados)
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
  /** Fuente de aleatoriedad (heredada de ActionContext). */
  rng: () => number;
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

  adjacent_allies: ({ state, playerNumber, sourceCardId }) => {
    const player = playerNumber === 1 ? state.player1 : state.player2;
    const idx = player.field_knights.findIndex(c => c.instance_id === sourceCardId);
    if (idx === -1) return [];
    return [player.field_knights[idx - 1], player.field_knights[idx + 1]].filter(Boolean);
  },

  adjacent_enemies: ({ state, playerNumber, event }) => {
  if (!event.targetCardId) return [];

  const opponent = playerNumber === 1 ? state.player2 : state.player1;
  const idx = opponent.field_knights.findIndex(c => c.instance_id === event.targetCardId);

  if (idx === -1) return [];

  return [
    opponent.field_knights[idx - 1],
    opponent.field_knights[idx + 1]
  ].filter(Boolean);
},

  opponent_helper: ({ state, playerNumber }) => {
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    return opponent.field_helper ? [opponent.field_helper] : [];
  },

  opponent_technique: ({ state, playerNumber, event }) => {
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    return opponent.field_techniques.filter(t => t.instance_id === event.targetCardId);    
  },

  target_and_adjacent_enemies: ({ state, playerNumber, event }) => {
    if (!event.targetCardId) return [];
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    const idx = opponent.field_knights.findIndex(c => c.instance_id === event.targetCardId);
    if (idx === -1) return [];
    return [
      opponent.field_knights[idx],
      opponent.field_knights[idx - 1],
      opponent.field_knights[idx + 1],
    ].filter(Boolean);
  },

  random_enemy: ({ state, playerNumber, rng }) => {
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    const enemies = opponent.field_knights;
    if (enemies.length === 0) return [];
    const randomIndex = Math.floor(rng() * enemies.length);
    return [enemies[randomIndex]];
  },

  random_ally: ({ state, playerNumber, rng }) => {
    const player = playerNumber === 1 ? state.player1 : state.player2;
    const allies = player.field_knights;
    if (allies.length === 0) return [];
    const randomIndex = Math.floor(rng() * allies.length);
    return [allies[randomIndex]];
  },

  other_allies: ({ state, playerNumber, sourceCardId }) => {
    const player = playerNumber === 1 ? state.player1 : state.player2;
    return player.field_knights.filter(c => c.instance_id !== sourceCardId);
  },

  lowest_health_enemy: ({ state, playerNumber }) => {
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    const enemies = opponent.field_knights;
    if (enemies.length === 0) return [];
    let lowestHpEnemy = enemies[0];
    for (const enemy of enemies) {
      if (enemy.current_health < lowestHpEnemy.current_health) {
        lowestHpEnemy = enemy;
      }
    }
    return [lowestHpEnemy];
  },
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
