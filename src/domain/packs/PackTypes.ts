/**
 * Tipos del sistema de sobres (domain/packs). Sin dependencias de BD ni de HTTP.
 */

/** Rarezas de carta, de menor a mayor. */
export const CARD_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'divine'] as const;
export type CardRarity = typeof CARD_RARITIES[number];

/** Fuente de aleatoriedad en [0, 1). SeededRNG la cumple: la apertura es reproducible con la semilla. */
export interface PackRandom {
  next(): number;
}

/** Carta que puede salir en un sobre (solo lo que el motor necesita). */
export interface PackCandidate {
  id: string;
  rarity: string;
}

/** Cartas elegibles de un sobre, agrupadas por rareza. */
export type PackPool = Record<CardRarity, string[]>;

export interface OpenedPackCard {
  card_id: string;
  /** Rareza real de la carta entregada. */
  rarity: CardRarity;
  /** Rareza sorteada (difiere de `rarity` si el sobre no tenía cartas de esa rareza). */
  rolled_rarity: CardRarity;
  /** Posición en el sobre (0-based). */
  position: number;
  /** True si esta carta la puso la garantía de épica. */
  from_guarantee: boolean;
}

export interface OpenPackResult {
  cards: OpenedPackCard[];
  guarantee: {
    /** El sobre llegó al umbral sin épica o superior y se reemplazó una carta por una épica. */
    applied: boolean;
    /** Carta reemplazada por la garantía (la que había salido antes). */
    replaced_card_id: string | null;
    position: number | null;
  };
  /** Sobres seguidos sin épica o superior: antes y después de este sobre. */
  pity_before: number;
  pity_after: number;
}
