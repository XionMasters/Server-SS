/**
 * Tipos base para reglas y modos de partida
 */

export type MatchMode = 'PVP' | 'TEST';

export interface DeckRules {
  min_cards: number;
  max_cards: number;
}

export interface TurnRules {
  draw_per_turn: number;
  cosmos_per_turn: number | ((turnNumber: number) => number);
}

export interface MatchRules {
  /** Vida inicial de cada jugador */
  initial_life: number;

  /** Cosmos inicial */
  initial_cosmos: number;

  /** Cantidad de cartas en mano al inicio */
  initial_hand_size: number;

  /** Reglas de mazo */
  deck: DeckRules;

  /** Reglas de turno */
  turn: TurnRules;
}
