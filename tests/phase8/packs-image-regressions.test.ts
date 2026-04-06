const mockPackModel = {
  findAll: jest.fn(),
};

const mockUserPackModel = {
  findAll: jest.fn(),
};

jest.mock('../../src/config/database', () => ({
  __esModule: true,
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../src/models/Pack', () => ({
  __esModule: true,
  default: mockPackModel,
}));

jest.mock('../../src/models/UserPack', () => ({
  __esModule: true,
  default: mockUserPackModel,
}));

jest.mock('../../src/models/User', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/models/Card', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/models/CardKnight', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/models/CardAbility', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/models/UserCard', () => ({
  __esModule: true,
  default: {},
}));

jest.mock('../../src/services/transactionService', () => ({
  __esModule: true,
  default: {},
}));

import { getAvailablePacks, getUserPacks } from '../../src/controllers/packs.controller';

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
});