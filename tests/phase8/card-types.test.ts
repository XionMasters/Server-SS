import { normalizeCardType } from '../../src/domain/game/CardTypes';
import { validateDeck } from '../../src/app/decks/deckValidator';
import Card from '../../src/infrastructure/database/models/Card';

describe('normalizeCardType', () => {
  test.each([
    ['caballero', 'knight'],
    ['Caballero', 'knight'],
    ['knight', 'knight'],
    ['tecnica', 'technique'],
    ['técnica', 'technique'],
    ['objeto', 'object'],
    ['item', 'object'],
    ['escenario', 'stage'],
    ['ayudante', 'helper'],
    ['ocasion', 'occasion'],
    ['ocasión', 'occasion'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeCardType(raw)).toBe(expected);
  });

  test('keeps unknown values and tolerates empty input', () => {
    expect(normalizeCardType('dragon')).toBe('dragon');
    expect(normalizeCardType(null)).toBe('');
    expect(normalizeCardType(undefined)).toBe('');
  });
});

describe('validateDeck with legacy Spanish card types', () => {
  afterEach(() => jest.restoreAllMocks());

  test('counts knights stored as "caballero" (no false "0 caballeros" warning)', async () => {
    jest.spyOn(Card, 'findAll').mockResolvedValue([
      { id: 'k', name: 'Seiya', type: 'caballero', rarity: 'common', max_copies: 3 },
      { id: 't', name: 'Meteoros', type: 'tecnica', rarity: 'common', max_copies: 3 },
    ] as any);

    // 15 caballeros (5 ids x 3) + 25 técnicas = 40 cartas
    const deckCards = [
      ...Array.from({ length: 5 }, () => ({ card_id: 'k', quantity: 3 })),
      ...Array.from({ length: 9 }, () => ({ card_id: 't', quantity: 3 })),
    ].slice(0, 14);

    const result = await validateDeck(deckCards);

    expect(result.warnings.some((w) => w.includes('caballeros'))).toBe(false);
  });

  test('allowedTypes accepts both languages', async () => {
    jest.spyOn(Card, 'findAll').mockResolvedValue([
      { id: 'k', name: 'Seiya', type: 'caballero', rarity: 'common', max_copies: 3 },
    ] as any);

    const result = await validateDeck(
      [{ card_id: 'k', quantity: 1 }],
      { minCards: 1, maxCards: 60, maxCopiesPerCard: 3, allowedTypes: ['knight'] },
    );

    expect(result.errors).toEqual([]);
  });
});
