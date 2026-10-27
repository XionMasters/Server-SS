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
  /** Cosmos otorgado automáticamente al inicio de cada turno */
  cosmos_on_turn_start: number | ((turnNumber: number) => number);
  /** Cosmos ganado por la acción Cargar Cosmo (Carregar Cosmo) */
  cosmos_per_charge: number | ((turnNumber: number) => number);
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
