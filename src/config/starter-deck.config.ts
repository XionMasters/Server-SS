// src/config/starter-deck.config.ts
/**
 * Configuración del Deck Inicial para nuevos usuarios
 *
 * Las cartas se referencian por `card_code` (columna cards.code), que es estable entre
 * bases de datos: los UUID cambian cada vez que se cargan las cartas en una BD nueva.
 * El total debe sumar 40 y cada cantidad respetar el max_copies de la carta.
 * Las técnicas deben ser compatibles (compatible_tags) con caballeros del propio mazo.
 */

export interface StarterDeckCard {
  card_code: string;
  quantity: number;
}

/** 🎴 DECK INICIAL - 40 cartas: bronces del Torneo Galáctico con sus técnicas. */
export const STARTER_DECK_CARDS: StarterDeckCard[] = [
  // CABALLEROS (23)
  { card_code: 'geki_bear', quantity: 3 },
  { card_code: 'ichi_hydra', quantity: 3 },
  { card_code: 'lionet_ban', quantity: 3 },
  { card_code: 'nachi_wolf', quantity: 3 },
  { card_code: 'jabu_unicorn', quantity: 3 },
  { card_code: 'seiya_pegasus_v1', quantity: 2 },
  { card_code: 'shiryu_dragon_v1', quantity: 2 },
  { card_code: 'hyoga_cygnus_v1', quantity: 2 },
  { card_code: 'shun_andromeda_v1', quantity: 2 },

  // TÉCNICAS (11)
  { card_code: 'hanging_bear', quantity: 2 },
  { card_code: 'lionet_bomber', quantity: 2 },
  { card_code: 'unicorn_gallop', quantity: 2 },
  { card_code: 'dead_howling', quantity: 2 },
  { card_code: 'diamond_dust', quantity: 1 },
  { card_code: 'nebula_chain', quantity: 1 },
  { card_code: 'pegasus_meteor_fist', quantity: 1 },

  // AYUDANTES (3)
  { card_code: 'helper_miho', quantity: 2 },
  { card_code: 'helper_cassios', quantity: 1 },

  // OCASIONES (3)
  { card_code: 'galaxian_wars', quantity: 2 },
  { card_code: 'burning_cosmos', quantity: 1 },
];

/**
 * Validación del deck inicial
 */
export const validateStarterDeck = (): { valid: boolean; total: number; message?: string } => {
  const total = STARTER_DECK_CARDS.reduce((sum, card) => sum + card.quantity, 0);
  
  if (total !== 40) {
    return {
      valid: false,
      total,
      message: `El deck inicial debe tener 40 cartas. Actualmente tiene ${total} cartas.`
    };
  }

  // Validar que todas las cantidades sean positivas.
  // El límite real por carta se valida con max_copies al persistir el deck.
  const invalidCards = STARTER_DECK_CARDS.filter(card => card.quantity < 1);
  if (invalidCards.length > 0) {
    return {
      valid: false,
      total,
      message: 'Todas las cartas del deck inicial deben tener una cantidad positiva.'
    };
  }

  return { valid: true, total };
};

/**
 * Nombre del deck inicial
 */
export const STARTER_DECK_NAME = 'Deck Inicial - Caballeros de Athena';

/**
 * Descripción del deck inicial
 */
export const STARTER_DECK_DESCRIPTION = 'Deck balanceado de inicio con caballeros de bronce y técnicas básicas para comenzar tu aventura.';
