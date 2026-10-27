const mockPackModel = {
  findAll: jest.fn(),
};

const mockUserPackModel = {
  findAll: jest.fn(),
};

const mockCardModel = {
  findAll: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  __esModule: true,
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/Pack', () => ({
  __esModule: true,
  default: mockPackModel,
}));

jest.mock('../../src/infrastructure/database/models/UserPack', () => ({
  __esModule: true,
  default: mockUserPackModel,
}));

jest.mock('../../src/infrastructure/database/models/User', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/infrastructure/database/models/Card', () => ({
  __esModule: true,
  default: mockCardModel,
}));

jest.mock('../../src/infrastructure/database/models/CardKnight', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/infrastructure/database/models/CardAbility', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/infrastructure/database/models/UserCard', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/infrastructure/database/services/transaction.service', () => ({
  __esModule: true,
  default: {},
}));

import { getAvailablePacks, getUserPacks } from '../../src/interfaces/http/controllers/packs.controller';
import { generateRandomCard } from '../../src/app/packs/pack.service';
import { SeededRNG } from '../../src/domain/game/combat/RNG';

function createMockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
}

describe('Pack image regressions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getAvailablePacks injects fallback image when pack image is missing', async () => {
    mockPackModel.findAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: 'pack-1',
          name: 'Sobre Básico',
          image_url: null,
        }),
      },
    ]);

    const res = createMockResponse();

    await getAvailablePacks({} as any, res as any);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          image_url: '/assets/examples/seiya.png',
        }),
      ],
    });
  });

  test('getUserPacks normalizes legacy relative image paths', async () => {
    mockUserPackModel.findAll.mockResolvedValue([
      {
        toJSON: () => ({
          id: 'user-pack-1',
          quantity: 2,
          Pack: {
            id: 'pack-2',
            name: 'Sobre de Oro',
            image_url: 'examples/seiya.png',
          },
        }),
      },
    ]);

    const req = { user: { id: 'user-1' } } as any;
    const res = createMockResponse();

    await getUserPacks(req, res as any);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          Pack: expect.objectContaining({
            image_url: '/assets/examples/seiya.png',
          }),
        }),
      ],
      total: 1,
    });
  });

  test('pack card selection is reproducible from its seeded random source', async () => {
    const cards = [{ id: 'card-1' }, { id: 'card-2' }, { id: 'card-3' }];
    mockCardModel.findAll.mockResolvedValue(cards);

    const first = await generateRandomCard({} as any, new SeededRNG(98765), 'common');
    const replay = await generateRandomCard({} as any, new SeededRNG(98765), 'common');

    expect(replay).toBe(first);
    expect(mockCardModel.findAll).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { rarity: 'common' },
    }));
  });
});