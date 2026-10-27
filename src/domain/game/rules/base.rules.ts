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

    // Cosmos automático al inicio de cada turno
    cosmos_on_turn_start: 1,

    // Cosmos ganado al usar la acción Cargar Cosmo
    cosmos_per_charge: 1
  }
};
