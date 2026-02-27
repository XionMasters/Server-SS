/**
 * Reglas base del juego
 * Usadas tanto para PVP como para TEST
 */

import { MatchRules } from './types';

export const BASE_MATCH_RULES: MatchRules = {
  initial_life: 12,
  initial_cosmos: 0,
  initial_hand_size: 5,

  deck: {
    min_cards: 40,
    max_cards: 60
  },

  turn: {
    draw_per_turn: 1,

    // Por ahora fijo, pero deja la puerta abierta a escalado
    cosmos_per_turn: 3
  }
};
