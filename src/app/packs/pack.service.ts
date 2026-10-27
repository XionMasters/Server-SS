import { Transaction } from 'sequelize';
import Card from '../../infrastructure/database/models/Card';
import CardAbility from '../../infrastructure/database/models/CardAbility';
import CardKnight from '../../infrastructure/database/models/CardKnight';
import Pack from '../../infrastructure/database/models/Pack';
import User from '../../infrastructure/database/models/User';
import UserPack from '../../infrastructure/database/models/UserPack';
import { sequelize } from '../../config/database';
import transactionService from '../../infrastructure/database/services/transaction.service';
import { randomBytes } from 'crypto';
import { SeededRNG } from '../../domain/game/combat/RNG';

const DEFAULT_PACK_IMAGE_URL = '/assets/examples/seiya.png';

const RARITY_WEIGHTS = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
};

export class PackRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: Record<string, number>
  ) {
    super(message);
    this.name = 'PackRequestError';
  }
}

export function createPackRandomSource(): { seed: number; rng: SeededRNG } {
  const seed = randomBytes(4).readUInt32BE(0);
  return { seed, rng: new SeededRNG(seed) };
}

export function normalizePackRarity(rarity?: string | null): string | null {
  if (!rarity) return null;

  const rarityMap: Record<string, string> = {
    comun: 'common',
    rara: 'rare',
    epica: 'epic',
    legendaria: 'legendary',
  };

  return rarityMap[rarity] || rarity;
}

function normalizePackImageUrl(imageUrl?: string | null): string {
  if (!imageUrl || imageUrl.trim() === '') return DEFAULT_PACK_IMAGE_URL;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/assets/')) {
    return imageUrl;
  }
  return `/assets/${imageUrl.replace(/^\/+/, '')}`;
}

export function serializePack(pack: any) {
  const data = typeof pack?.toJSON === 'function' ? pack.toJSON() : pack;
  return {
    ...data,
    image_url: normalizePackImageUrl(data?.image_url),
    guaranteed_rarity: normalizePackRarity(data?.guaranteed_rarity),
  };
}

export function serializeUserPack(userPack: any) {
  const data = typeof userPack?.toJSON === 'function' ? userPack.toJSON() : userPack;
  return {
    ...data,
    Pack: data?.Pack ? serializePack(data.Pack) : data?.Pack,
  };
}

export async function generateRandomCard(
  transaction: Transaction,
  rng: SeededRNG,
  guaranteedRarity?: string
): Promise<any> {
  let targetRarity = normalizePackRarity(guaranteedRarity);

  if (!targetRarity) {
    const random = rng.next() * 100;
    let cumulative = 0;
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      cumulative += weight;
      if (random <= cumulative) {
        targetRarity = rarity;
        break;
      }
    }
  }

  const include = [
    { model: CardKnight, as: 'card_knight', required: false },
    { model: CardAbility, as: 'card_abilities', required: false },
  ];
  const cards = await Card.findAll({ where: { rarity: targetRarity }, include, transaction });
  if (cards.length > 0) {
    return cards[Math.floor(rng.next() * cards.length)];
  }

  const fallbackCards = await Card.findAll({
    where: { rarity: 'common' },
    include,
    transaction,
  });
  return fallbackCards[Math.floor(rng.next() * fallbackCards.length)];
}

export async function buyPackForUser(userId: string, packId: string, quantity: number) {
  if (!packId) throw new PackRequestError('pack_id es requerido', 400);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new PackRequestError('La cantidad debe estar entre 1 y 10', 400);
  }

  return sequelize.transaction(async (transaction) => {
    const pack = await Pack.findOne({ where: { id: packId, is_active: true }, transaction });
    if (!pack) throw new PackRequestError('Pack no encontrado o no disponible', 404);

    const user = await User.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!user) throw new PackRequestError('Usuario no encontrado', 404);

    const totalCost = pack.price * quantity;
    if (user.currency < totalCost) {
      throw new PackRequestError('Monedas insuficientes', 400, {
        required: totalCost,
        available: user.currency,
      });
    }

    const balanceBefore = user.currency;
    user.currency -= totalCost;
    await user.save({ transaction });
    await transactionService.logCurrencyTransaction(
      userId, totalCost, 'SPEND', 'PACK_PURCHASE', `Compra de ${quantity}x ${pack.name}`,
      'pack', packId, { pack_name: pack.name, quantity }, transaction,
      { before: balanceBefore, after: user.currency }
    );

    let userPack = await UserPack.findOne({
      where: { user_id: userId, pack_id: packId },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (userPack) {
      userPack.quantity += quantity;
      await userPack.save({ transaction });
    } else {
      userPack = await UserPack.create({ user_id: userId, pack_id: packId, quantity }, { transaction });
    }

    return { pack, user, userPack, totalCost };
  });
}
