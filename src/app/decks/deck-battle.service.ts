import Deck from '../../infrastructure/database/models/Deck';
import DeckCard from '../../infrastructure/database/models/DeckCard';
import { DEFAULT_DECK_CONSTRUCTION_RULES } from '../../config/deck-rules.config';
import { ActiveDeckValidationResult } from './deck.types';
import { shuffleArray } from './deck.rules';

export class DeckBattleService {
  static async getAndValidateActiveDeck(
    userId: string,
    minSize: number = DEFAULT_DECK_CONSTRUCTION_RULES.minCards,
    maxSize: number = DEFAULT_DECK_CONSTRUCTION_RULES.maxCards
  ): Promise<ActiveDeckValidationResult> {
    const activeDeck = await Deck.findOne({ where: { user_id: userId, is_active: true } });

    if (!activeDeck) {
      throw new Error('No tienes un mazo activo. Marca un mazo como activo primero.');
    }

    const deckCards = await DeckCard.findAll({ where: { deck_id: activeDeck.id } });
    const totalCards = deckCards.reduce((sum, deckCard) => sum + (deckCard.quantity || 1), 0);

    if (totalCards < minSize) {
      throw new Error(`Tu mazo activo solo tiene ${totalCards} cartas. Necesita mínimo ${minSize} cartas para jugar.`);
    }

    if (totalCards > maxSize) {
      throw new Error(`Tu mazo activo tiene ${totalCards} cartas. El máximo permitido es ${maxSize}.`);
    }

    return { deck: activeDeck, deckCards, totalCards };
  }

  static async expandAndShuffleDeckCardIds(
    deckId: string,
    random?: () => number,
  ): Promise<string[]> {
    const deckCards = await DeckCard.findAll({ where: { deck_id: deckId } });
    const expandedIds: string[] = [];

    for (const deckCard of deckCards) {
      const quantity = deckCard.quantity ?? 1;
      for (let i = 0; i < quantity; i++) {
        expandedIds.push(deckCard.card_id);
      }
    }

    return shuffleArray(expandedIds, random);
  }
}
