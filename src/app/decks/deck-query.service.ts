import Deck from '../../infrastructure/database/models/Deck';
import DeckCard from '../../infrastructure/database/models/DeckCard';
import Card from '../../infrastructure/database/models/Card';
import CardKnight from '../../infrastructure/database/models/CardKnight';
import DeckBack from '../../infrastructure/database/models/DeckBack';
import { getDeckStats, validateExistingDeck } from './deckValidator';
import { DeckServiceError } from './deck.errors';
import { shuffleArray } from './deck.rules';

export class DeckQueryService {
  static async getUserDecks(userId: string) {
    return Deck.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
        {
          model: DeckBack,
          as: 'deck_back',
          attributes: ['id', 'name', 'image_url'],
        },
        {
          model: Card,
          as: 'cover_card',
          attributes: ['id', 'name', 'image_url'],
          required: false,
        },
      ],
      order: [['created_at', 'DESC']],
    });
  }

  static async getDeckByIdForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({
      where: { id: deckId, user_id: userId },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
        {
          model: DeckBack,
          as: 'deck_back',
          attributes: ['id', 'name', 'image_url'],
        },
        {
          model: Card,
          as: 'cover_card',
          attributes: ['id', 'name', 'image_url'],
          required: false,
        },
      ],
    });

    if (!deck) {
      throw new DeckServiceError(404, 'Deck no encontrado');
    }

    return deck;
  }

  static async validateDeckForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new DeckServiceError(404, 'Deck no encontrado');
    }

    const validation = await validateExistingDeck(deckId);
    return {
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      deck_name: deck.name,
    };
  }

  static async getDeckStatisticsForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new DeckServiceError(404, 'Deck no encontrado');
    }

    const deckCards = await DeckCard.findAll({
      where: { deck_id: deckId },
      include: [{
        model: Card,
        as: 'card',
        include: [{ model: CardKnight, as: 'card_knight' }],
      }],
    });

    return {
      deck_name: deck.name,
      ...(await getDeckStats(deckCards)),
    };
  }

  static async getDeckCardsExpandedForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({
      where: { id: deckId, user_id: userId },
      include: [{
        model: Card,
        as: 'cards',
        through: { attributes: ['quantity'] },
        include: [{ model: CardKnight, as: 'card_knight' }],
      }],
    });

    if (!deck) {
      throw new DeckServiceError(404, 'Deck no encontrado');
    }

    const expandedCards: any[] = [];
    const cards = (deck as any).cards || [];
    for (const card of cards) {
      const quantity = card.DeckCard?.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        expandedCards.push(card);
      }
    }

    return shuffleArray(expandedCards);
  }
}
