import Deck from '../../infrastructure/database/models/Deck';
import DeckCard from '../../infrastructure/database/models/DeckCard';
import Card from '../../infrastructure/database/models/Card';
import CardKnight from '../../infrastructure/database/models/CardKnight';
import DeckBack from '../../infrastructure/database/models/DeckBack';
import UserCard from '../../infrastructure/database/models/UserCard';
import sequelize from '../../config/database';
import { generateAndSaveDeck, DeckGenerationOptions } from './deckGenerator';
import {
  DEFAULT_DECK_CONSTRUCTION_RULES,
} from '../../config/deck-rules.config';
import { Op, Transaction } from 'sequelize';
import { DeckServiceError as ServiceError } from './deck.errors';
import {
  assertCardQuantityAllowed,
  assertDeckSizeLimit,
  normalizeQuantity,
  normalizeSyncPayload,
  shuffleArray,
  validateDeckName,
} from './deck.rules';
import { DeckBattleService } from './deck-battle.service';
import { ActiveDeckValidationResult } from './deck.types';
import { DeckQueryService } from './deck-query.service';

export { ServiceError };
export type { ActiveDeckValidationResult };

export class DeckService {
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

  static getUserDecks(userId: string) {
    return DeckQueryService.getUserDecks(userId);
  }

  static getDeckByIdForUser(userId: string, deckId: string) {
    return DeckQueryService.getDeckByIdForUser(userId, deckId);
  }

  static async createDeckForUser(userId: string, name: string, description?: string) {
    if (!name) {
      throw new ServiceError(400, 'El nombre del deck es requerido');
    }

    const deckName = validateDeckName(name);

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
      const normalizedName = validateDeckName(data.name);

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
      assertCardQuantityAllowed(card, nextQuantity, ownedQuantity);
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

      assertCardQuantityAllowed(card, normalizedQuantity, ownedQuantity);
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

    const normalizedCards = normalizeSyncPayload(cards);
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

        assertCardQuantityAllowed(card, requestedCard.quantity, ownedQuantity);
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

  static validateDeckForUser(userId: string, deckId: string) {
    return DeckQueryService.validateDeckForUser(userId, deckId);
  }

  static getDeckStatisticsForUser(userId: string, deckId: string) {
    return DeckQueryService.getDeckStatisticsForUser(userId, deckId);
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

  static getDeckCardsExpandedForUser(userId: string, deckId: string) {
    return DeckQueryService.getDeckCardsExpandedForUser(userId, deckId);
  }

  static getAndValidateActiveDeck(
    userId: string,
    minSize: number = DEFAULT_DECK_CONSTRUCTION_RULES.minCards,
    maxSize: number = DEFAULT_DECK_CONSTRUCTION_RULES.maxCards
  ): Promise<ActiveDeckValidationResult> {
    return DeckBattleService.getAndValidateActiveDeck(userId, minSize, maxSize);
  }

  static expandAndShuffleDeckCardIds(deckId: string, random?: () => number): Promise<string[]> {
    return DeckBattleService.expandAndShuffleDeckCardIds(deckId, random);
  }
}
