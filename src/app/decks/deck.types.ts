import Deck from '../../infrastructure/database/models/Deck';
import DeckCard from '../../infrastructure/database/models/DeckCard';

export interface ActiveDeckValidationResult {
  deck: Deck;
  deckCards: DeckCard[];
  totalCards: number;
}
