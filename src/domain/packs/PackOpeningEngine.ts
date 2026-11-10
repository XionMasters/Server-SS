/**
 * Motor puro de apertura de sobres: sorteo de rarezas, elección de cartas y garantía de épica.
 * No conoce la BD: recibe las cartas elegibles (PackPool) y una fuente de aleatoriedad.
 *
 * Garantía: el jugador lleva, por cada sobre, la cuenta de sobres seguidos sin épica o superior
 * (`pity`). Si un sobre trae una de forma natural, la cuenta vuelve a 0. Si no la trae y con él
 * se llega al umbral (10 por defecto), una carta al azar del sobre se reemplaza por una épica
 * real del sobre (nunca se toca la rareza de la carta en el catálogo) y la cuenta vuelve a 0.
 *
 * Rarezas sin cartas en el sobre: se entrega la rareza más cercana por debajo que tenga cartas
 * (o por encima si no hay ninguna por debajo). `rolled_rarity` conserva lo sorteado.
 */

import { CARD_RARITIES, type CardRarity, type OpenPackResult, type OpenedPackCard, type PackCandidate, type PackPool, type PackRandom } from './PackTypes';
import { CARDS_PER_PACK, DEFAULT_PITY_THRESHOLD, GUARANTEE_RARITIES, rarityProbabilities } from './PackConfig';

export class PackPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackPoolError';
  }
}

export function isCardRarity(value: unknown): value is CardRarity {
  return typeof value === 'string' && (CARD_RARITIES as readonly string[]).includes(value);
}

export function isGuaranteeRarity(rarity: CardRarity): boolean {
  return GUARANTEE_RARITIES.includes(rarity);
}

/** Agrupa las cartas por rareza (ordenadas por id para que la apertura sea reproducible). */
export function buildPackPool(candidates: PackCandidate[]): PackPool {
  const pool = Object.fromEntries(CARD_RARITIES.map(r => [r, [] as string[]])) as PackPool;
  for (const card of candidates) {
    if (isCardRarity(card.rarity)) pool[card.rarity].push(card.id);
  }
  for (const rarity of CARD_RARITIES) pool[rarity].sort();
  return pool;
}

/** Rarezas sin ninguna carta en el sobre (salen como la rareza más cercana). */
export function missingRarities(pool: PackPool): CardRarity[] {
  return CARD_RARITIES.filter(r => pool[r].length === 0);
}

/** El sobre necesita cartas y al menos una épica o superior para poder cumplir la garantía. */
export function validatePackPool(pool: PackPool): void {
  if (CARD_RARITIES.every(r => pool[r].length === 0))
    throw new PackPoolError('El sobre no tiene cartas');
  if (GUARANTEE_RARITIES.every(r => pool[r].length === 0))
    throw new PackPoolError('El sobre no tiene cartas épicas o superiores para la garantía');
}

export function rollRarity(rng: PackRandom, probabilities = rarityProbabilities()): CardRarity {
  const roll = rng.next();
  let cumulative = 0;
  for (const rarity of CARD_RARITIES) {
    cumulative += probabilities[rarity];
    if (roll < cumulative) return rarity;
  }
  return 'common'; // redondeo: la suma puede quedarse un pelo por debajo de 1
}

/** La rareza pedida si el sobre tiene cartas de ella; si no, la más cercana por debajo (o por encima). */
export function resolveAvailableRarity(pool: PackPool, rarity: CardRarity): CardRarity {
  const index = CARD_RARITIES.indexOf(rarity);
  for (let i = index; i >= 0; i--) if (pool[CARD_RARITIES[i]].length > 0) return CARD_RARITIES[i];
  for (let i = index + 1; i < CARD_RARITIES.length; i++) if (pool[CARD_RARITIES[i]].length > 0) return CARD_RARITIES[i];
  throw new PackPoolError('El sobre no tiene cartas');
}

/** Rareza que entrega la garantía: épica, o la primera superior que tenga cartas. */
function guaranteeRarity(pool: PackPool): CardRarity {
  const rarity = GUARANTEE_RARITIES.find(r => pool[r].length > 0);
  if (!rarity) throw new PackPoolError('El sobre no tiene cartas épicas o superiores para la garantía');
  return rarity;
}

function pickIndex(rng: PackRandom, length: number): number {
  return Math.min(length - 1, Math.floor(rng.next() * length));
}

function pickCard(pool: PackPool, rarity: CardRarity, rng: PackRandom): string {
  const ids = pool[rarity];
  return ids[pickIndex(rng, ids.length)];
}

/** Sobres que faltan (incluido el que garantiza) para la próxima épica asegurada. */
export function packsUntilGuarantee(pity: number, threshold = DEFAULT_PITY_THRESHOLD): number {
  return Math.max(1, threshold - Math.max(0, pity));
}

export interface OpenPackOptions {
  pool: PackPool;
  rng: PackRandom;
  /** Sobres seguidos sin épica o superior antes de este. */
  pityBefore?: number;
  pityThreshold?: number;
  cardsPerPack?: number;
}

export function openPack(options: OpenPackOptions): OpenPackResult {
  const { pool, rng } = options;
  const cardsPerPack = options.cardsPerPack ?? CARDS_PER_PACK;
  const threshold = Math.max(1, options.pityThreshold ?? DEFAULT_PITY_THRESHOLD);
  const pityBefore = Math.max(0, Math.floor(options.pityBefore ?? 0));
  validatePackPool(pool);

  const probabilities = rarityProbabilities(cardsPerPack);
  const cards: OpenedPackCard[] = [];
  for (let position = 0; position < cardsPerPack; position++) {
    const rolled = rollRarity(rng, probabilities);
    const rarity = resolveAvailableRarity(pool, rolled);
    cards.push({ card_id: pickCard(pool, rarity, rng), rarity, rolled_rarity: rolled, position, from_guarantee: false });
  }

  const naturalSpecial = cards.some(c => isGuaranteeRarity(c.rarity));
  const guarantee: OpenPackResult['guarantee'] = { applied: false, replaced_card_id: null, position: null };

  if (!naturalSpecial && pityBefore + 1 >= threshold) {
    const position = pickIndex(rng, cards.length);
    const rarity = guaranteeRarity(pool);
    guarantee.applied = true;
    guarantee.replaced_card_id = cards[position].card_id;
    guarantee.position = position;
    cards[position] = {
      card_id: pickCard(pool, rarity, rng),
      rarity,
      rolled_rarity: cards[position].rolled_rarity,
      position,
      from_guarantee: true,
    };
  }

  const pityAfter = naturalSpecial || guarantee.applied ? 0 : pityBefore + 1;
  return { cards, guarantee, pity_before: pityBefore, pity_after: pityAfter };
}
