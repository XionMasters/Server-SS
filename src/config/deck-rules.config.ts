import { BASE_MATCH_RULES } from '../game/rules/base.rules';

export interface DeckConstructionRules {
  minCards: number;
  maxCards: number;
  defaultTargetCards: number;
  defaultMaxLegendaries: number;
  defaultMaxCopiesPerCard: number;
}

export const DEFAULT_DECK_CONSTRUCTION_RULES: DeckConstructionRules = {
  minCards: BASE_MATCH_RULES.deck.min_cards,
  maxCards: BASE_MATCH_RULES.deck.max_cards,
  defaultTargetCards: 45,
  defaultMaxLegendaries: 5,
  defaultMaxCopiesPerCard: 3,
};

export function getCardDeckCopyLimit(maxCopies: number | null | undefined): number {
  if (typeof maxCopies !== 'number' || maxCopies <= 0) {
    return 1;
  }

  return maxCopies;
}

export function clampDeckTargetCards(targetCards: number): number {
  return Math.min(
    Math.max(Math.trunc(targetCards), DEFAULT_DECK_CONSTRUCTION_RULES.minCards),
    DEFAULT_DECK_CONSTRUCTION_RULES.maxCards
  );
}