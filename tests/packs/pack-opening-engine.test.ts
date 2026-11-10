/**
 * Motor de apertura de sobres (domain/packs): probabilidades, garantía de épica cada 10 sobres
 * seguidos sin épica o superior, y rarezas sin cartas en el sobre.
 */
import { SeededRNG } from '../../src/domain/game/combat/RNG';
import { CARDS_PER_PACK, perCardProbability, rarityProbabilities } from '../../src/domain/packs/PackConfig';
import {
  buildPackPool, isGuaranteeRarity, openPack, packsUntilGuarantee, PackPoolError, resolveAvailableRarity, rollRarity,
} from '../../src/domain/packs/PackOpeningEngine';
import type { PackCandidate, PackRandom } from '../../src/domain/packs/PackTypes';

/** RNG con valores fijos (luego devuelve 0). */
function scripted(values: number[]): PackRandom {
  let i = 0;
  return { next: () => (i < values.length ? values[i++] : 0) };
}

// Valores de tirada que caen en cada rareza (ver rarityProbabilities)
const ROLL = { common: 0, uncommon: 0.6, rare: 0.9, epic: 0.99, legendary: 0.9996, divine: 0.99997 };

/** 5 cartas: [tirada de rareza, elección de carta] por cada una. */
function packRolls(rarities: Array<keyof typeof ROLL>): number[] {
  return rarities.flatMap(r => [ROLL[r], 0]);
}

function candidates(): PackCandidate[] {
  const out: PackCandidate[] = [];
  for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'divine']) {
    for (let i = 0; i < 3; i++) out.push({ id: `${rarity}-${i}`, rarity });
  }
  return out;
}

const fullPool = () => buildPackPool(candidates());
const allCommon = packRolls(['common', 'common', 'common', 'common', 'common']);

describe('Probabilidades', () => {
  test('por carta suman 1 y coinciden con la especificación', () => {
    const p = rarityProbabilities();
    const total = Object.values(p).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
    expect(p.common).toBeCloseTo(0.497439, 5);
    expect(p.uncommon).toBeCloseTo(0.348208, 5);
    expect(p.rare).toBeCloseTo(0.139283, 5);
    expect(p.epic).toBeCloseTo(0.0144093, 6);
    expect(p.legendary).toBeCloseTo(0.0006007, 6);
    expect(p.divine).toBeCloseTo(0.00006, 6);
  });

  test('las especiales salen en un sobre con la probabilidad objetivo', () => {
    const perPack = (pCard: number) => 1 - Math.pow(1 - pCard, CARDS_PER_PACK);
    expect(perPack(perCardProbability(0.07))).toBeCloseTo(0.07, 10);
    expect(perPack(perCardProbability(0.003))).toBeCloseTo(0.003, 10);
  });

  test('las tiradas de referencia caen en su rareza', () => {
    for (const [rarity, value] of Object.entries(ROLL)) {
      expect(rollRarity(scripted([value]))).toBe(rarity);
    }
  });

  test('simulación: ~7,3 % de sobres con épica o superior natural', () => {
    const rng = new SeededRNG(12345);
    const pool = fullPool();
    let withSpecial = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const { cards } = openPack({ pool, rng, pityBefore: 0, pityThreshold: 1000 });
      if (cards.some(c => isGuaranteeRarity(c.rarity))) withSpecial++;
    }
    // 1 − (1 − 0,01507)^5 ≈ 7,31 %
    expect(withSpecial / N).toBeGreaterThan(0.065);
    expect(withSpecial / N).toBeLessThan(0.081);
  });
});

describe('Sobre', () => {
  test('trae 5 cartas con su posición', () => {
    const { cards } = openPack({ pool: fullPool(), rng: new SeededRNG(1) });
    expect(cards).toHaveLength(5);
    expect(cards.map(c => c.position)).toEqual([0, 1, 2, 3, 4]);
  });

  test('es reproducible con la misma semilla', () => {
    const a = openPack({ pool: fullPool(), rng: new SeededRNG(98765), pityBefore: 9 });
    const b = openPack({ pool: fullPool(), rng: new SeededRNG(98765), pityBefore: 9 });
    expect(b).toEqual(a);
  });

  test('puede traer varias especiales y se conservan todas', () => {
    const rng = scripted(packRolls(['epic', 'divine', 'common', 'epic', 'legendary']));
    const result = openPack({ pool: fullPool(), rng, pityBefore: 9 });
    expect(result.cards.map(c => c.rarity)).toEqual(['epic', 'divine', 'common', 'epic', 'legendary']);
    expect(result.guarantee.applied).toBe(false);
  });
});

describe('Garantía de épica cada 10 sobres', () => {
  test('sin especiales y por debajo del umbral, el contador sube', () => {
    const result = openPack({ pool: fullPool(), rng: scripted(allCommon), pityBefore: 3 });
    expect(result.guarantee.applied).toBe(false);
    expect(result.pity_after).toBe(4);
  });

  test('el décimo sobre seguido sin épica reemplaza una carta por una épica', () => {
    // 5 comunes, luego posición elegida (0.4 → 2) y la épica (0 → epic-0)
    const rng = scripted([...allCommon, 0.4, 0]);
    const result = openPack({ pool: fullPool(), rng, pityBefore: 9 });

    expect(result.guarantee).toEqual({ applied: true, replaced_card_id: 'common-0', position: 2 });
    expect(result.cards[2]).toMatchObject({ card_id: 'epic-0', rarity: 'epic', from_guarantee: true });
    expect(result.cards.filter(c => c.from_guarantee)).toHaveLength(1);
    expect(result.cards.filter(c => c.rarity === 'common')).toHaveLength(4);
    expect(result.pity_after).toBe(0);
  });

  test.each(['epic', 'legendary', 'divine'] as const)('una %s natural cumple la garantía y reinicia el contador', (rarity) => {
    const rng = scripted(packRolls(['common', rarity, 'common', 'common', 'common']));
    const result = openPack({ pool: fullPool(), rng, pityBefore: 9 });
    expect(result.guarantee.applied).toBe(false);
    expect(result.cards[1].rarity).toBe(rarity);
    expect(result.pity_after).toBe(0);
  });

  test('una épica natural antes del umbral también reinicia el contador', () => {
    const rng = scripted(packRolls(['epic', 'common', 'common', 'common', 'common']));
    expect(openPack({ pool: fullPool(), rng, pityBefore: 4 }).pity_after).toBe(0);
  });

  test('nunca pasan más de 10 sobres seguidos sin épica o superior', () => {
    const rng = new SeededRNG(777);
    const pool = fullPool();
    let pity = 0;
    let streak = 0;
    let maxStreak = 0;
    let applied = 0;
    for (let i = 0; i < 3000; i++) {
      const result = openPack({ pool, rng, pityBefore: pity });
      pity = result.pity_after;
      if (result.guarantee.applied) applied++;
      streak = result.cards.some(c => isGuaranteeRarity(c.rarity)) ? 0 : streak + 1;
      maxStreak = Math.max(maxStreak, streak);
    }
    expect(maxStreak).toBeLessThanOrEqual(9);
    expect(applied).toBeGreaterThan(0);
  });

  test('si el sobre no tiene épicas, la garantía da la primera rareza superior que tenga', () => {
    const pool = buildPackPool(candidates().filter(c => c.rarity !== 'epic'));
    const result = openPack({ pool, rng: scripted([...allCommon, 0, 0]), pityBefore: 9 });
    expect(result.cards[0]).toMatchObject({ rarity: 'legendary', from_guarantee: true });
  });

  test('packsUntilGuarantee cuenta el sobre que la garantiza', () => {
    expect(packsUntilGuarantee(0)).toBe(10);
    expect(packsUntilGuarantee(9)).toBe(1);
    expect(packsUntilGuarantee(4, 5)).toBe(1);
  });
});

describe('Rarezas sin cartas en el sobre', () => {
  test('sale la rareza más cercana por debajo y se conserva la sorteada', () => {
    const pool = buildPackPool(candidates().filter(c => c.rarity !== 'uncommon'));
    const rng = scripted(packRolls(['uncommon', 'common', 'common', 'common', 'common']));
    const { cards } = openPack({ pool, rng });
    expect(cards[0]).toMatchObject({ rarity: 'common', rolled_rarity: 'uncommon' });
  });

  test('si no hay ninguna por debajo, la más cercana por encima', () => {
    const pool = buildPackPool(candidates().filter(c => c.rarity !== 'common'));
    expect(resolveAvailableRarity(pool, 'common')).toBe('uncommon');
  });

  test('un sobre sin épicas ni superiores no se puede abrir', () => {
    const pool = buildPackPool(candidates().filter(c => !['epic', 'legendary', 'divine'].includes(c.rarity)));
    expect(() => openPack({ pool, rng: new SeededRNG(1) })).toThrow(PackPoolError);
  });

  test('un sobre vacío no se puede abrir', () => {
    expect(() => openPack({ pool: buildPackPool([]), rng: new SeededRNG(1) })).toThrow(PackPoolError);
  });

  test('las rarezas desconocidas no entran en el sobre', () => {
    const pool = buildPackPool([{ id: 'x', rarity: 'mythic' }, { id: 'e', rarity: 'epic' }]);
    expect(Object.values(pool).flat()).toEqual(['e']);
  });
});
