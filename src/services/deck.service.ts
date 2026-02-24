import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import DeckBack from '../models/DeckBack';
import UserCard from '../models/UserCard';
import { validateExistingDeck, getDeckStats } from '../utils/deckValidator';
import { generateAndSaveDeck, DeckGenerationOptions } from '../utils/deckGenerator';

export class ServiceError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ActiveDeckValidationResult {
  deck: Deck;
  deckCards: DeckCard[];
  totalCards: number;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export class DeckService {
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
      ],
    });

    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    return deck;
  }

  static async createDeckForUser(userId: string, name: string, description?: string) {
    if (!name || name.trim() === '') {
      throw new ServiceError(400, 'El nombre del deck es requerido');
    }

    let defaultDeckBackId: string | null = null;
    try {
      const defaultDeckBack = await (DeckBack as any).findOne({
        where: { unlock_type: 'default', is_active: true },
      });
      if (defaultDeckBack) {
        defaultDeckBackId = defaultDeckBack.id;
      }
    } catch (backError) {
      console.warn('No se pudo obtener el dorso por defecto:', backError);
    }

    return Deck.create({
      user_id: userId,
      name: name.trim(),
      description: description?.trim(),
      is_active: false,
      current_deck_back_id: defaultDeckBackId,
    });
  }

  static async updateDeckForUser(
    userId: string,
    deckId: string,
    data: { name?: string; description?: string; is_active?: boolean }
  ) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    if (data.name !== undefined) {
      deck.name = data.name.trim();
    }

    if (data.description !== undefined) {
      deck.description = data.description?.trim();
    }

    if (data.is_active !== undefined) {
      if (data.is_active) {
        await Deck.update({ is_active: false }, { where: { user_id: userId } });
      }
      deck.is_active = data.is_active;
    }

    await deck.save();
    return deck;
  }

  static async deleteDeckForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    await deck.destroy();
  }

  static async addCardToDeck(userId: string, deckId: string, cardId: string, quantity: number = 1) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    const card = await Card.findByPk(cardId);
    if (!card) {
      throw new ServiceError(404, 'Carta no encontrada');
    }

    const maxAllowed = card.max_copies === 0 ? 1 : card.max_copies;
    const existingDeckCard = await DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId } });

    if (existingDeckCard) {
      const newQuantity = Math.min(existingDeckCard.quantity + quantity, maxAllowed);

      if (newQuantity === existingDeckCard.quantity) {
        throw new ServiceError(400, `"${card.name}" ya tiene el máximo de ${maxAllowed} copia(s) permitida(s)`);
      }

      existingDeckCard.quantity = newQuantity;
      await existingDeckCard.save();
      return { deckCard: existingDeckCard, created: false };
    }

    const deckCard = await DeckCard.create({
      deck_id: deckId,
      card_id: cardId,
      quantity: Math.min(quantity, maxAllowed),
    });

    return { deckCard, created: true };
  }

  static async removeCardFromDeck(userId: string, deckId: string, cardId: string) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    const deckCard = await DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId } });
    if (!deckCard) {
      throw new ServiceError(404, 'Carta no encontrada en el deck');
    }

    await deckCard.destroy();
  }

  static async updateCardQuantity(userId: string, deckId: string, cardId: string, quantity: number) {
    if (!quantity || quantity < 1) {
      throw new ServiceError(400, 'La cantidad debe ser mayor a 0');
    }

    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    const card = await Card.findByPk(cardId);
    if (!card) {
      throw new ServiceError(404, 'Carta no encontrada');
    }

    const maxAllowed = card.max_copies === 0 ? 1 : card.max_copies;
    if (quantity > maxAllowed) {
      throw new ServiceError(400, `"${card.name}": máximo ${maxAllowed} copia(s) permitida(s)`);
    }

    const deckCard = await DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId } });
    if (!deckCard) {
      throw new ServiceError(404, 'Carta no encontrada en el deck');
    }

    deckCard.quantity = quantity;
    await deckCard.save();

    return deckCard;
  }

  static async syncDeckCards(userId: string, deckId: string, cards: Array<{ card_id: string; quantity: number }>) {
    if (!Array.isArray(cards)) {
      throw new ServiceError(400, 'Se requiere un array de cartas');
    }

    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    await DeckCard.destroy({ where: { deck_id: deckId } });

    for (const cardData of cards) {
      const { card_id, quantity } = cardData;
      const card = await Card.findByPk(card_id);
      if (!card) {
        continue;
      }

      await DeckCard.create({
        deck_id: deckId,
        card_id,
        quantity: Math.min(Math.max(quantity, 1), card.max_copies === 0 ? 1 : card.max_copies),
      });
    }

    return Deck.findOne({
      where: { id: deckId },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
      ],
    });
  }

  static async validateDeckForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
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
      throw new ServiceError(404, 'Deck no encontrado');
    }

    const deckCards = await DeckCard.findAll({
      where: { deck_id: deckId },
      include: [
        {
          model: Card,
          as: 'card',
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
      ],
    });

    const stats = await getDeckStats(deckCards);

    return {
      deck_name: deck.name,
      ...stats,
    };
  }

  static async autoGenerateDeckForUser(
    userId: string,
    deckId: string,
    input: {
      strategy?: string;
      element?: string;
      faction?: string;
      targetCards?: number;
      maxLegendaries?: number;
    }
  ) {
    const {
      strategy = 'balanced',
      element,
      faction,
      targetCards = 45,
      maxLegendaries = 5,
    } = input;

    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    const userCards = await UserCard.findAll({ where: { user_id: userId } });
    if (userCards.length === 0) {
      throw new ServiceError(400, 'No tienes cartas en tu colección');
    }

    const userCardData = userCards.map((uc) => ({
      card_id: uc.card_id,
      quantity: uc.quantity || 1,
    }));

    const validStrategies = ['balanced', 'aggressive', 'defensive', 'element', 'faction', 'random'] as const;
    const isValidStrategy = (value: string): value is DeckGenerationOptions['strategy'] => {
      return (validStrategies as readonly string[]).includes(value);
    };

    if (!isValidStrategy(strategy)) {
      throw new ServiceError(400, 'Estrategia inválida');
    }

    if (strategy === 'element' && !element) {
      throw new ServiceError(400, 'Debe especificar un elemento para la estrategia "element"');
    }

    if (strategy === 'faction' && !faction) {
      throw new ServiceError(400, 'Debe especificar una facción para la estrategia "faction"');
    }

    const options: DeckGenerationOptions = {
      strategy,
      element,
      faction,
      targetCards,
      maxLegendaries,
    };

    const generatedDeck = await generateAndSaveDeck(userId, deckId, userCardData, options);

    const updatedDeck = await Deck.findOne({
      where: { id: deckId },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
      ],
    });

    return {
      message: 'Deck generado exitosamente',
      deck: updatedDeck,
      generation_info: {
        strategy_used: generatedDeck.strategy_used,
        stats: generatedDeck.stats,
      },
    };
  }

  static async getDeckCardsExpandedForUser(userId: string, deckId: string) {
    const deck = await Deck.findOne({
      where: { id: deckId, user_id: userId },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }],
        },
      ],
    });

    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
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

  static async getAndValidateActiveDeck(
    userId: string,
    minSize: number = 40,
    maxSize: number = 60
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

    return {
      deck: activeDeck,
      deckCards,
      totalCards,
    };
  }

  /**
   * Expande las cartas de un deck según quantity y las baraja.
   * Retorna array de card_ids (no objetos Card).
   * Usado para inicialización de partidas.
   */
  static async expandAndShuffleDeckCardIds(deckId: string): Promise<string[]> {
    const deckCards = await DeckCard.findAll({ where: { deck_id: deckId } });

    // Expandir según quantity
    const expandedIds: string[] = [];
    for (const dc of deckCards) {
      const quantity = dc.quantity ?? 1;
      for (let i = 0; i < quantity; i++) {
        expandedIds.push(dc.card_id);
      }
    }

    // Barajar y retornar
    return shuffleArray(expandedIds);
  }
}
