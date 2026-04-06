import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import DeckBack from '../models/DeckBack';
import UserCard from '../models/UserCard';
import sequelize from '../config/database';
import { validateExistingDeck, getDeckStats } from '../utils/deckValidator';
import { generateAndSaveDeck, DeckGenerationOptions } from '../utils/deckGenerator';
import {
  DEFAULT_DECK_CONSTRUCTION_RULES,
  getCardDeckCopyLimit,
} from '../config/deck-rules.config';
import { Op, Transaction } from 'sequelize';

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

interface RequestedDeckCard {
  card_id: string;
  quantity: number;
}

function normalizeQuantity(quantity: number): number {
  const parsedQuantity = Number(quantity);

  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
    throw new ServiceError(400, 'La cantidad debe ser un entero mayor a 0');
  }

  return parsedQuantity;
}

function assertDeckSizeLimit(totalCards: number): void {
  if (totalCards < DEFAULT_DECK_CONSTRUCTION_RULES.minCards) {
    throw new ServiceError(
      400,
      `El mazo debe tener al menos ${DEFAULT_DECK_CONSTRUCTION_RULES.minCards} cartas. Actual: ${totalCards}`
    );
  }

  if (totalCards > DEFAULT_DECK_CONSTRUCTION_RULES.maxCards) {
    throw new ServiceError(
      400,
      `El mazo no puede tener más de ${DEFAULT_DECK_CONSTRUCTION_RULES.maxCards} cartas. Actual: ${totalCards}`
    );
  }
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
  private static validateDeckName(rawName: string): string {
    const trimmedName = rawName.trim();

    if (trimmedName.length < 3) {
      throw new ServiceError(400, 'El nombre del deck debe tener al menos 3 caracteres');
    }

    if (trimmedName.length > 100) {
      throw new ServiceError(400, 'El nombre del deck no puede superar 100 caracteres');
    }

    return trimmedName;
  }

  private static async getDeckForUserOrThrow(userId: string, deckId: string, transaction?: Transaction) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId }, transaction });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    return deck;
  }

  private static async getDeckTotalCards(deckId: string, transaction?: Transaction): Promise<number> {
    const deckCards = await DeckCard.findAll({ where: { deck_id: deckId }, transaction });
    return deckCards.reduce((sum, deckCard) => sum + (deckCard.quantity || 0), 0);
  }

  private static async getCardAndOwnershipForUser(
    userId: string,
    cardId: string,
    transaction?: Transaction
  ): Promise<{ card: Card; ownedQuantity: number }> {
    const [card, userCard] = await Promise.all([
      Card.findByPk(cardId, { transaction }),
      UserCard.findOne({
        where: { user_id: userId, card_id: cardId },
        transaction,
      }),
    ]);

    if (!card) {
      throw new ServiceError(404, 'Carta no encontrada');
    }

    const ownedQuantity = userCard?.quantity || 0;
    if (ownedQuantity < 1) {
      throw new ServiceError(400, `"${card.name}" no está disponible en tu colección`);
    }

    return { card, ownedQuantity };
  }

  private static assertCardQuantityAllowed(card: Card, requestedQuantity: number, ownedQuantity: number): void {
    const maxByCard = getCardDeckCopyLimit(card.max_copies);

    if (requestedQuantity > maxByCard) {
      throw new ServiceError(400, `"${card.name}": máximo ${maxByCard} copia(s) permitida(s)`);
    }

    if (requestedQuantity > ownedQuantity) {
      throw new ServiceError(400, `"${card.name}": solo tienes ${ownedQuantity} copia(s) en tu colección`);
    }
  }

  private static normalizeSyncPayload(cards: RequestedDeckCard[]): RequestedDeckCard[] {
    const seenCardIds = new Set<string>();

    return cards.map((cardData) => {
      if (!cardData || typeof cardData.card_id !== 'string' || cardData.card_id.trim() === '') {
        throw new ServiceError(400, 'Cada entrada del mazo debe incluir un card_id válido');
      }

      if (seenCardIds.has(cardData.card_id)) {
        throw new ServiceError(400, `La carta ${cardData.card_id} está repetida en la sincronización del mazo`);
      }

      seenCardIds.add(cardData.card_id);

      return {
        card_id: cardData.card_id,
        quantity: normalizeQuantity(cardData.quantity),
      };
    });
  }

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
      throw new ServiceError(404, 'Deck no encontrado');
    }

    return deck;
  }

  static async createDeckForUser(userId: string, name: string, description?: string) {
    if (!name) {
      throw new ServiceError(400, 'El nombre del deck es requerido');
    }

    const deckName = this.validateDeckName(name);

    const existingDeck = await Deck.findOne({ where: { user_id: userId, name: deckName } });
    if (existingDeck) {
      throw new ServiceError(400, 'Ya tienes un deck con ese nombre');
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
      name: deckName,
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
      const normalizedName = this.validateDeckName(data.name);

      const existingDeckWithName = await Deck.findOne({
        where: {
          user_id: userId,
          name: normalizedName,
          id: { [Op.ne]: deck.id },
        },
      });

      if (existingDeckWithName) {
        throw new ServiceError(400, 'Ya tienes un deck con ese nombre');
      }

      deck.name = normalizedName;
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
    const quantityToAdd = normalizeQuantity(quantity);

    return sequelize.transaction(async (transaction) => {
      await this.getDeckForUserOrThrow(userId, deckId, transaction);

      const [{ card, ownedQuantity }, existingDeckCard, currentDeckSize] = await Promise.all([
        this.getCardAndOwnershipForUser(userId, cardId, transaction),
        DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId }, transaction }),
        this.getDeckTotalCards(deckId, transaction),
      ]);

      const nextQuantity = (existingDeckCard?.quantity || 0) + quantityToAdd;
      this.assertCardQuantityAllowed(card, nextQuantity, ownedQuantity);
      assertDeckSizeLimit(currentDeckSize + quantityToAdd);

      if (existingDeckCard) {
        existingDeckCard.quantity = nextQuantity;
        await existingDeckCard.save({ transaction });
        return { deckCard: existingDeckCard, created: false };
      }

      const deckCard = await DeckCard.create(
        {
          deck_id: deckId,
          card_id: cardId,
          quantity: nextQuantity,
        },
        { transaction }
      );

      return { deckCard, created: true };
    });
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

    // Si la carta eliminada era la portada, limpiar la portada
    if (deck.deck_cover_card_id === cardId) {
      await deck.update({ deck_cover_card_id: null });
    }
  }

  static async setDeckCoverCard(userId: string, deckId: string, cardId: string | null) {
    const deck = await Deck.findOne({ where: { id: deckId, user_id: userId } });
    if (!deck) {
      throw new ServiceError(404, 'Deck no encontrado');
    }

    if (cardId === null) {
      await deck.update({ deck_cover_card_id: null });
      return deck;
    }

    // Validar que la carta existe en el deck
    const deckCard = await DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId } });
    if (!deckCard) {
      throw new ServiceError(400, 'La carta no está en el mazo');
    }

    await deck.update({ deck_cover_card_id: cardId });
    return deck;
  }

  static async updateCardQuantity(userId: string, deckId: string, cardId: string, quantity: number) {
    const normalizedQuantity = normalizeQuantity(quantity);

    return sequelize.transaction(async (transaction) => {
      await this.getDeckForUserOrThrow(userId, deckId, transaction);

      const [{ card, ownedQuantity }, deckCard, currentDeckSize] = await Promise.all([
        this.getCardAndOwnershipForUser(userId, cardId, transaction),
        DeckCard.findOne({ where: { deck_id: deckId, card_id: cardId }, transaction }),
        this.getDeckTotalCards(deckId, transaction),
      ]);

      if (!deckCard) {
        throw new ServiceError(404, 'Carta no encontrada en el deck');
      }

      this.assertCardQuantityAllowed(card, normalizedQuantity, ownedQuantity);
      assertDeckSizeLimit(currentDeckSize - deckCard.quantity + normalizedQuantity);

      deckCard.quantity = normalizedQuantity;
      await deckCard.save({ transaction });

      return deckCard;
    });
  }

  static async syncDeckCards(userId: string, deckId: string, cards: Array<{ card_id: string; quantity: number }>) {
    if (!Array.isArray(cards)) {
      throw new ServiceError(400, 'Se requiere un array de cartas');
    }

    const normalizedCards = this.normalizeSyncPayload(cards);
    const totalCards = normalizedCards.reduce((sum, card) => sum + card.quantity, 0);
    assertDeckSizeLimit(totalCards);

    return sequelize.transaction(async (transaction) => {
      await this.getDeckForUserOrThrow(userId, deckId, transaction);

      const cardIds = normalizedCards.map((card) => card.card_id);
      const [foundCards, ownedCards] = await Promise.all([
        cardIds.length > 0
          ? Card.findAll({ where: { id: { [Op.in]: cardIds } }, transaction })
          : Promise.resolve([] as Card[]),
        cardIds.length > 0
          ? UserCard.findAll({
              where: {
                user_id: userId,
                card_id: { [Op.in]: cardIds },
              },
              transaction,
            })
          : Promise.resolve([] as UserCard[]),
      ]);

      const cardMap = new Map(foundCards.map((card) => [card.id, card]));
      const ownedCardsMap = new Map(ownedCards.map((userCard) => [userCard.card_id, userCard.quantity]));

      for (const requestedCard of normalizedCards) {
        const card = cardMap.get(requestedCard.card_id);
        if (!card) {
          throw new ServiceError(404, `Carta con ID ${requestedCard.card_id} no encontrada`);
        }

        const ownedQuantity = ownedCardsMap.get(requestedCard.card_id) || 0;
        if (ownedQuantity < 1) {
          throw new ServiceError(400, `"${card.name}" no está disponible en tu colección`);
        }

        this.assertCardQuantityAllowed(card, requestedCard.quantity, ownedQuantity);
      }

      await DeckCard.destroy({ where: { deck_id: deckId }, transaction });

      if (normalizedCards.length > 0) {
        await DeckCard.bulkCreate(
          normalizedCards.map((card) => ({
            deck_id: deckId,
            card_id: card.card_id,
            quantity: card.quantity,
          })),
          { transaction }
        );
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
        transaction,
      });
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
      targetCards = DEFAULT_DECK_CONSTRUCTION_RULES.defaultTargetCards,
      maxLegendaries = DEFAULT_DECK_CONSTRUCTION_RULES.defaultMaxLegendaries,
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
