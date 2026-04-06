const mockTransaction = jest.fn(async (callback: (transaction: object) => Promise<unknown>) => callback({}));

const mockDeckModel = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
};

const mockDeckCardModel = {
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
  bulkCreate: jest.fn(),
};

const mockCardModel = {
  findByPk: jest.fn(),
  findAll: jest.fn(),
};

const mockUserCardModel = {
  findOne: jest.fn(),
  findAll: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  __esModule: true,
  default: {
    transaction: mockTransaction,
  },
  sequelize: {
    transaction: mockTransaction,
  },
}));

jest.mock('../../src/models/Deck', () => ({
  __esModule: true,
  default: mockDeckModel,
}));

jest.mock('../../src/models/DeckCard', () => ({
  __esModule: true,
  default: mockDeckCardModel,
}));

jest.mock('../../src/models/Card', () => ({
  __esModule: true,
  default: mockCardModel,
}));

jest.mock('../../src/models/UserCard', () => ({
  __esModule: true,
  default: mockUserCardModel,
}));

jest.mock('../../src/models/CardKnight', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/models/DeckBack', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

import { DeckService, ServiceError } from '../../src/services/deck.service';
import { generateDeck } from '../../src/utils/deckGenerator';
import { validateDeck } from '../../src/utils/deckValidator';

describe('Deck system regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTransaction.mockImplementation(async (callback: (transaction: object) => Promise<unknown>) => callback({}));
  });

  test('addCardToDeck rejects quantities above user collection', async () => {
    mockDeckModel.findOne.mockResolvedValue({ id: 'deck-1' });
    mockCardModel.findByPk.mockResolvedValue({ id: 'card-1', name: 'Jabu', max_copies: 3 });
    mockUserCardModel.findOne.mockResolvedValue({ card_id: 'card-1', quantity: 1 });
    mockDeckCardModel.findOne.mockResolvedValue(null);
    mockDeckCardModel.findAll.mockResolvedValue([]);

    await expect(DeckService.addCardToDeck('user-1', 'deck-1', 'card-1', 2)).rejects.toMatchObject({
      status: 400,
      message: '"Jabu": solo tienes 1 copia(s) en tu colección',
    } satisfies Partial<ServiceError>);

    expect(mockDeckCardModel.create).not.toHaveBeenCalled();
  });

  test('addCardToDeck rejects quantities above card max_copies', async () => {
    mockDeckModel.findOne.mockResolvedValue({ id: 'deck-1' });
    mockCardModel.findByPk.mockResolvedValue({ id: 'card-1', name: 'Carta Unica', max_copies: 1 });
    mockUserCardModel.findOne.mockResolvedValue({ card_id: 'card-1', quantity: 10 });
    mockDeckCardModel.findOne.mockResolvedValue(null);
    mockDeckCardModel.findAll.mockResolvedValue([]);

    await expect(DeckService.addCardToDeck('user-1', 'deck-1', 'card-1', 2)).rejects.toMatchObject({
      status: 400,
      message: '"Carta Unica": máximo 1 copia(s) permitida(s)',
    } satisfies Partial<ServiceError>);

    expect(mockDeckCardModel.create).not.toHaveBeenCalled();
  });

  test('syncDeckCards validates payload before deleting current deck', async () => {
    mockDeckModel.findOne.mockResolvedValue({ id: 'deck-1' });
    mockCardModel.findAll.mockResolvedValue([
      { id: 'card-1', name: 'Seiya', max_copies: 3 },
    ]);
    mockUserCardModel.findAll.mockResolvedValue([
      { card_id: 'card-1', quantity: 1 },
    ]);

    await expect(
      DeckService.syncDeckCards('user-1', 'deck-1', [{ card_id: 'card-1', quantity: 2 }])
    ).rejects.toMatchObject({
      status: 400,
      message: '"Seiya": solo tienes 1 copia(s) en tu colección',
    } satisfies Partial<ServiceError>);

    expect(mockDeckCardModel.destroy).not.toHaveBeenCalled();
    expect(mockDeckCardModel.bulkCreate).not.toHaveBeenCalled();
  });

  test('validateDeck counts knight and legendary keys with English enums', async () => {
    const deckCards = Array.from({ length: 40 }, (_, index) => ({
      card_id: `card-${index}`,
      quantity: 1,
    }));

    mockCardModel.findAll.mockResolvedValue(
      deckCards.map((deckCard, index) => ({
        id: deckCard.card_id,
        name: `Card ${index}`,
        type: index < 16 ? 'knight' : 'technique',
        rarity: index < 13 ? 'legendary' : 'common',
        max_copies: 3,
        unique: false,
        power_level: null,
        cost: 0,
        generate: 0,
        element: null,
      }))
    );

    const result = await validateDeck(deckCards as any);

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((warning) => warning.includes('Solo tienes'))).toBe(false);
    expect(result.warnings.some((warning) => warning.includes('legendarias/divinas'))).toBe(true);
  });

  test('generateDeck never exceeds card max_copies in flexible mode', async () => {
    mockCardModel.findAll.mockResolvedValue([
      {
        id: 'card-1',
        name: 'June',
        type: 'knight',
        rarity: 'common',
        max_copies: 1,
        unique: false,
        cost: 0,
        power_level: 1,
        element: 'light',
      },
    ]);

    const result = await generateDeck(
      [{ card_id: 'card-1', quantity: 10 }],
      { strategy: 'balanced', targetCards: 40 }
    );

    expect(result.cards).toEqual([{ card_id: 'card-1', quantity: 1 }]);
    expect(result.stats.total_cards).toBe(1);
  });
});