/**
 * Configuración de la apertura de sobres.
 *
 * Cada carta del sobre sortea su rareza por separado (puede haber varias especiales en un sobre).
 * Las especiales se calibran por sobre: P_carta = 1 − (1 − P_sobre)^(1/5), de forma que la
 * probabilidad de que un sobre de 5 cartas traiga al menos una de esa rareza sea P_sobre.
 * El resto se reparte entre común, poco común y rara en proporción 50:35:14.
 *
 *   rareza      por sobre    por carta
 *   epic        7 %          1,44093 %
 *   legendary   0,3 %        0,06007 %
 *   divine      0,03 %       0,00600 %
 *   common      —            49,7439 %
 *   uncommon    —            34,8208 %
 *   rare        —            13,9283 %
 */

import type { CardRarity } from './PackTypes';

export const CARDS_PER_PACK = 5;

/** Sobres seguidos sin épica o superior tras los que el siguiente garantiza una. */
export const DEFAULT_PITY_THRESHOLD = 10;

/** Rarezas que cumplen la garantía ("épica o superior"). */
export const GUARANTEE_RARITIES: readonly CardRarity[] = ['epic', 'legendary', 'divine'];

/** Probabilidad objetivo de que un sobre traiga al menos una carta de la rareza. */
export const SPECIAL_RARITY_PER_PACK: Record<'epic' | 'legendary' | 'divine', number> = {
  epic: 0.07,
  legendary: 0.003,
  divine: 0.0003,
};

/** Proporción entre las rarezas básicas (se reparten lo que dejan las especiales). */
export const BASE_RARITY_RATIO: Record<'common' | 'uncommon' | 'rare', number> = {
  common: 50,
  uncommon: 35,
  rare: 14,
};

export function perCardProbability(perPack: number, cardsPerPack = CARDS_PER_PACK): number {
  return 1 - Math.pow(1 - perPack, 1 / cardsPerPack);
}

/** Probabilidad de cada rareza para una carta. Suma 1. */
export function rarityProbabilities(cardsPerPack = CARDS_PER_PACK): Record<CardRarity, number> {
  const epic = perCardProbability(SPECIAL_RARITY_PER_PACK.epic, cardsPerPack);
  const legendary = perCardProbability(SPECIAL_RARITY_PER_PACK.legendary, cardsPerPack);
  const divine = perCardProbability(SPECIAL_RARITY_PER_PACK.divine, cardsPerPack);
  const rest = 1 - epic - legendary - divine;
  const ratioTotal = BASE_RARITY_RATIO.common + BASE_RARITY_RATIO.uncommon + BASE_RARITY_RATIO.rare;
  return {
    common: rest * BASE_RARITY_RATIO.common / ratioTotal,
    uncommon: rest * BASE_RARITY_RATIO.uncommon / ratioTotal,
    rare: rest * BASE_RARITY_RATIO.rare / ratioTotal,
    epic,
    legendary,
    divine,
  };
}
