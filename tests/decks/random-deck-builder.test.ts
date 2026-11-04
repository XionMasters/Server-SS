import { buildRandomDeck, CatalogCard } from '../../src/app/decks/randomDeckBuilder';

/** RNG determinista (mulberry32) para que los tests sean reproducibles */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 0;
function card(partial: Partial<CatalogCard> & Pick<CatalogCard, 'type' | 'faction'>): CatalogCard {
  nextId++;
  return {
    id: `id-${nextId}`,
    code: `card_${nextId}`,
    name: `Carta ${nextId}`,
    rarity: 'common',
    max_copies: 3,
    unique: false,
    tags: [],
    compatible_tags: null,
    ...partial,
  };
}

function catalog(): CatalogCard[] {
  const cards: CatalogCard[] = [];
  for (const faction of ['Athena', 'Poseidon']) {
    for (let i = 0; i < 20; i++) {
      const rarity = i < 3 ? 'legendary' : i < 8 ? 'rare' : 'common';
      cards.push(card({ type: 'knight', faction, rarity, unique: i % 4 === 0, tags: [`${faction}_k${i}`] }));
    }
    // Técnicas: la mitad compatibles con algún caballero de la facción, la otra mitad con nadie
    for (let i = 0; i < 10; i++) {
      cards.push(card({ type: 'technique', faction, compatible_tags: [i < 5 ? `${faction}_k${i}` : 'nadie'] }));
    }
    for (const type of ['object', 'helper', 'occasion', 'stage']) {
      for (let i = 0; i < 4; i++) cards.push(card({ type, faction }));
    }
  }
  // Facción pequeña: no debe poder elegirse (menos de 15 caballeros)
  for (let i = 0; i < 3; i++) cards.push(card({ type: 'knight', faction: 'Marte' }));
  cards.push(card({ type: 'helper', faction: 'Neutral' }));
  return cards;
}

describe('buildRandomDeck', () => {
  const cat = catalog();
  const byId = new Map(cat.map(c => [c.id, c]));

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('genera un mazo válido (semilla %i)', (seed) => {
    const deck = buildRandomDeck(cat, { rng: seeded(seed) });

    expect(deck.total).toBeGreaterThanOrEqual(40);
    expect(deck.total).toBeLessThanOrEqual(60);
    expect(deck.cards.reduce((s, c) => s + c.quantity, 0)).toBe(deck.total);
    expect(['Athena', 'Poseidon']).toContain(deck.faction);

    let legendaries = 0;
    for (const { card_id, quantity } of deck.cards) {
      const c = byId.get(card_id)!;
      expect(quantity).toBeGreaterThan(0);
      expect(quantity).toBeLessThanOrEqual(c.max_copies ?? 1);
      if (c.unique) expect(quantity).toBe(1);
      if (c.rarity === 'legendary') legendaries++;
      // Nada de otra facción salvo neutrales (el catálogo de prueba tiene de sobra)
      expect([deck.faction, 'Neutral']).toContain(c.faction);
    }
    expect(legendaries).toBeLessThanOrEqual(4);
  });

  it('solo incluye técnicas que algún caballero del mazo puede usar', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const deck = buildRandomDeck(cat, { rng: seeded(seed) });
      const knightTags = new Set(
        deck.cards.map(e => byId.get(e.card_id)!).filter(c => c.type === 'knight').flatMap(c => c.tags ?? []),
      );
      const techniques = deck.cards.map(e => byId.get(e.card_id)!).filter(c => c.type === 'technique');
      for (const t of techniques) {
        expect((t.compatible_tags ?? []).some(tag => knightTags.has(tag))).toBe(true);
      }
    }
  });

  it('tiene una base de caballeros y entre 1 y 2 escenarios', () => {
    const deck = buildRandomDeck(cat, { rng: seeded(42) });
    expect(deck.by_type.knight).toBeGreaterThanOrEqual(20);
    expect(deck.by_type.stage).toBeGreaterThanOrEqual(1);
    expect(deck.by_type.stage).toBeLessThanOrEqual(2);
  });

  it('respeta una facción forzada y completa con otras si la facción se queda corta', () => {
    const small: CatalogCard[] = [
      ...Array.from({ length: 15 }, () => card({ type: 'knight', faction: 'Hades', unique: true })),
      ...Array.from({ length: 20 }, () => card({ type: 'knight', faction: 'Athena' })),
    ];
    const deck = buildRandomDeck(small, { faction: 'Hades', rng: seeded(7) });
    expect(deck.faction).toBe('Hades');
    expect(deck.total).toBeGreaterThanOrEqual(40);
  });

  it('falla si ninguna facción tiene caballeros suficientes', () => {
    const tiny = [card({ type: 'knight', faction: 'Marte' })];
    expect(() => buildRandomDeck(tiny)).toThrow('facción');
  });
});
