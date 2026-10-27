const mockRepository = {
  findCards: jest.fn(),
  findCardById: jest.fn(),
  countCards: jest.fn(),
  countMatching: jest.fn(),
  countBy: jest.fn(),
};

jest.mock('../../src/infrastructure/database/repositories/SequelizeCardCatalogRepository', () => ({
  SequelizeCardCatalogRepository: jest.fn().mockImplementation(() => mockRepository),
}));

import { applyCardTranslation, translationLanguagesFor } from '../../src/app/cards/card-translation';
import { CardCatalogUseCases } from '../../src/app/cards/card-catalog.use-cases';
import { getCard, getCardSummary, listCards } from '../../src/interfaces/http/controllers/cards.controller';
import cardRoutes from '../../src/interfaces/http/routes/cards.routes';
import {
  createCardDefinitionCache,
  invalidateCardDefinition,
} from '../../src/infrastructure/cache/card-definition.cache';

function createMockResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

const baseCard = () => ({
  id: 'card-1',
  name: 'Seiya de Pegaso',
  description: 'Texto base',
  card_abilities: [
    { id: 'ab-1', name: 'Meteoros', description: 'Daño' },
    { id: 'ab-2', name: 'Cometa', description: 'Más daño' },
  ],
  translations: [
    {
      language: 'en',
      name: 'Pegasus Seiya',
      description: 'Base text',
      ability_translations: { 'ab-1': { name: 'Meteors', description: 'Damage' } },
    },
    { language: 'pt', name: 'Seiya de Pégaso', description: '', ability_translations: {} },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('card translation', () => {
  test('ES needs no translations; other languages fall back to EN', () => {
    expect(translationLanguagesFor('es')).toEqual([]);
    expect(translationLanguagesFor('en')).toEqual(['en']);
    expect(translationLanguagesFor('pt')).toEqual(['pt', 'en']);
  });

  test('ES keeps base text and strips translations', () => {
    const result = applyCardTranslation(baseCard(), 'es');

    expect(result.name).toBe('Seiya de Pegaso');
    expect(result).not.toHaveProperty('translations');
  });

  test('applies requested language and ability translations', () => {
    const result = applyCardTranslation(baseCard(), 'en');

    expect(result.name).toBe('Pegasus Seiya');
    expect(result.description).toBe('Base text');
    expect(result.card_abilities).toEqual([
      { id: 'ab-1', name: 'Meteors', description: 'Damage' },
      { id: 'ab-2', name: 'Cometa', description: 'Más daño' },
    ]);
    expect(result).not.toHaveProperty('translations');
  });

  test('empty translated fields fall back to base text', () => {
    const result = applyCardTranslation(baseCard(), 'pt');

    expect(result.name).toBe('Seiya de Pégaso');
    expect(result.description).toBe('Texto base');
  });

  test('missing requested language falls back to EN', () => {
    const result = applyCardTranslation(baseCard(), 'fr');

    expect(result.name).toBe('Pegasus Seiya');
  });
});

describe('CardCatalogUseCases', () => {
  test('getSummary aggregates counts', async () => {
    mockRepository.countCards.mockResolvedValue(3);
    mockRepository.countBy.mockImplementation(async (field: string) => [{ [field]: 'x', count: '3' }]);

    const summary = await new CardCatalogUseCases(mockRepository).getSummary();

    expect(summary).toEqual({
      total: 3,
      by_type: [{ type: 'x', count: '3' }],
      by_rarity: [{ rarity: 'x', count: '3' }],
      by_element: [{ element: 'x', count: '3' }],
    });
  });
});

describe('cards controller', () => {
  test('listCards parses query, applies defaults and translation', async () => {
    mockRepository.findCards.mockResolvedValue([baseCard()]);
    mockRepository.countMatching.mockResolvedValue(128);
    const res = createMockResponse();

    await listCards(
      {
        query: {
          type: ['knight', 'technique'],
          cost_min: '2',
          cost_max: 'abc',
          tags: 'bronze,pegasus',
          include_stats: 'true',
          limit: 'not-a-number',
        },
      } as any,
      res as any
    );

    expect(mockRepository.findCards).toHaveBeenCalledWith({
      filters: expect.objectContaining({
        type: ['knight', 'technique'],
        costMin: 2,
        costMax: undefined,
        tags: ['bronze', 'pegasus'],
      }),
      includeStats: true,
      includeAbilities: false,
      translationLanguages: ['en'],
      limit: 100,
      offset: 0,
    });
    // `total` = tamaño de página (contrato antiguo); `total_count` = total real para paginar
    expect(mockRepository.countMatching).toHaveBeenCalledWith(expect.objectContaining({
      type: ['knight', 'technique'],
    }));
    expect(res.json).toHaveBeenCalledWith({
      total: 1,
      total_count: 128,
      cards: [expect.objectContaining({ name: 'Pegasus Seiya' })],
    });
  });

  test('getCard returns 404 when the card does not exist', async () => {
    mockRepository.findCardById.mockResolvedValue(null);
    const res = createMockResponse();

    await getCard({ params: { id: 'missing' }, query: { lang: 'es' } } as any, res as any);

    expect(mockRepository.findCardById).toHaveBeenCalledWith('missing', []);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'Carta no encontrada' });
  });

  test('repository errors become a generic 500', async () => {
    mockRepository.countCards.mockRejectedValue(new Error('db down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = createMockResponse();

    await getCardSummary({} as any, res as any);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error interno del servidor' });
  });

  test('routes expose only public reads', () => {
    const routes = (cardRoutes as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => [Object.keys(layer.route.methods)[0], layer.route.path]);

    expect(routes).toEqual([
      ['get', '/'],
      ['get', '/stats/summary'],
      ['get', '/:id'],
    ]);
  });
});

describe('card definition cache', () => {
  test('invalidateCardDefinition clears the card from every registered cache', () => {
    const definitions = createCardDefinitionCache<string>();
    const abilities = createCardDefinitionCache<string[]>();
    definitions.set('card-1', 'def');
    definitions.set('card-2', 'other');
    abilities.set('card-1', ['ab']);

    invalidateCardDefinition('card-1');

    expect(definitions.has('card-1')).toBe(false);
    expect(abilities.has('card-1')).toBe(false);
    expect(definitions.get('card-2')).toBe('other');
  });
});
