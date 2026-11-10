/**
 * Sobres: compra, apertura y progreso de la garantía de épica.
 *
 * La apertura la decide el motor puro (domain/packs/PackOpeningEngine): este servicio carga las
 * cartas elegibles del sobre (cards.collection_id ∈ pack.collections), lleva el contador de la
 * garantía (user_pack_pity) y entrega las cartas, todo en una única transacción.
 */
import { Op, Transaction } from 'sequelize';
import Card from '../../infrastructure/database/models/Card';
import CardAbility from '../../infrastructure/database/models/CardAbility';
import CardKnight from '../../infrastructure/database/models/CardKnight';
import Pack from '../../infrastructure/database/models/Pack';
import User from '../../infrastructure/database/models/User';
import UserCard from '../../infrastructure/database/models/UserCard';
import UserPack from '../../infrastructure/database/models/UserPack';
import UserPackPity from '../../infrastructure/database/models/UserPackPity';
import { sequelize } from '../../config/database';
import transactionService from '../../infrastructure/database/services/transaction.service';
import { randomBytes, randomUUID } from 'crypto';
import { SeededRNG } from '../../domain/game/combat/RNG';
import { CARDS_PER_PACK, DEFAULT_PITY_THRESHOLD } from '../../domain/packs/PackConfig';
import { buildPackPool, openPack, packsUntilGuarantee, PackPoolError } from '../../domain/packs/PackOpeningEngine';

const DEFAULT_PACK_IMAGE_URL = '/assets/examples/seiya.png';

/** Probabilidad de que una carta salga en versión foil. */
const FOIL_CHANCE = 0.05;

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

/** Semilla aleatoria (crypto) + RNG determinista: la apertura se puede reproducir con la semilla. */
export function createPackRandomSource(): { seed: number; rng: SeededRNG } {
  const seed = randomBytes(4).readUInt32BE(0);
  return { seed, rng: new SeededRNG(seed) };
}

function normalizePackImageUrl(imageUrl?: string | null): string {
  if (!imageUrl || imageUrl.trim() === '') return DEFAULT_PACK_IMAGE_URL;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://') || imageUrl.startsWith('/assets/')) {
    return imageUrl;
  }
  return `/assets/${imageUrl.replace(/^\/+/, '')}`;
}

export interface PackProgress {
  /** Sobres seguidos abiertos sin épica o superior. */
  packs_without_epic: number;
  pity_threshold: number;
  /** Sobres que faltan, contando el que la garantiza, para la próxima épica asegurada. */
  packs_until_guarantee: number;
}

export function buildPackProgress(packsWithoutEpic: number, threshold?: number | null): PackProgress {
  const pityThreshold = threshold && threshold > 0 ? threshold : DEFAULT_PITY_THRESHOLD;
  const count = Math.max(0, packsWithoutEpic || 0);
  return {
    packs_without_epic: count,
    pity_threshold: pityThreshold,
    packs_until_guarantee: packsUntilGuarantee(count, pityThreshold),
  };
}

export function serializePack(pack: any, progress?: PackProgress) {
  const data = typeof pack?.toJSON === 'function' ? pack.toJSON() : pack;
  return {
    ...data,
    image_url: normalizePackImageUrl(data?.image_url),
    // La rareza garantizada de los sobres viejos ya no existe: la garantía es la épica cada N sobres
    guaranteed_rarity: null,
    cards_per_pack: data?.cards_per_pack ?? CARDS_PER_PACK,
    coming_soon: data?.coming_soon === true,
    pity_threshold: data?.pity_threshold ?? DEFAULT_PITY_THRESHOLD,
    ...(progress ? { progress } : {}),
  };
}

export function serializeUserPack(userPack: any, progress?: PackProgress) {
  const data = typeof userPack?.toJSON === 'function' ? userPack.toJSON() : userPack;
  return {
    ...data,
    Pack: data?.Pack ? serializePack(data.Pack, progress) : data?.Pack,
  };
}

/** Progreso de la garantía del jugador en cada sobre (pack_id → contador). */
export async function getPackProgressByPack(userId: string): Promise<Map<string, number>> {
  const rows = await UserPackPity.findAll({ where: { user_id: userId } });
  return new Map(rows.map(r => [r.pack_id, r.packs_without_epic]));
}

export async function buyPackForUser(userId: string, packId: string, quantity: number) {
  if (!packId) throw new PackRequestError('pack_id es requerido', 400);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new PackRequestError('La cantidad debe estar entre 1 y 10', 400);
  }

  return sequelize.transaction(async (transaction) => {
    const pack = await Pack.findOne({ where: { id: packId, is_active: true }, transaction });
    if (!pack) throw new PackRequestError('Pack no encontrado o no disponible', 404);
    if (pack.coming_soon) throw new PackRequestError('Este sobre estará disponible próximamente', 409);

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

export interface OpenedCard {
  card: any;
  isFoil: boolean;
  isNew: boolean;
  position: number;
  fromGuarantee: boolean;
}

export interface OpenPackOutcome {
  opening_id: string;
  pack: any;
  userPack: any;
  openedCards: OpenedCard[];
  guarantee: { applied: boolean; position: number | null };
  progress: PackProgress;
}

/** Cartas que pueden salir en el sobre: las de sus colecciones. */
async function loadPackPool(pack: any, transaction: Transaction) {
  const collections: string[] = Array.isArray(pack.collections) ? pack.collections : [];
  if (collections.length === 0) throw new PackRequestError('Este sobre no tiene cartas configuradas', 409);
  const candidates = await Card.findAll({
    where: { collection_id: { [Op.in]: collections } },
    attributes: ['id', 'rarity'],
    transaction,
  });
  return buildPackPool(candidates.map((c: any) => ({ id: c.id, rarity: c.rarity })));
}

/**
 * Abre un sobre del inventario del jugador: sortea las 5 cartas, aplica la garantía de épica,
 * las añade a la colección, actualiza el contador y descuenta el sobre. Todo o nada.
 */
export async function openPackForUser(
  userId: string,
  ids: { userPackId?: string; packId?: string },
): Promise<OpenPackOutcome> {
  if (!ids.userPackId && !ids.packId) throw new PackRequestError('pack_id o user_pack_id es requerido', 400);

  return sequelize.transaction(async (transaction) => {
    const userPack = await UserPack.findOne({
      where: ids.userPackId ? { id: ids.userPackId, user_id: userId } : { user_id: userId, pack_id: ids.packId },
      include: [{ model: Pack, as: 'Pack' }],
      transaction,
      // Bloquear solo user_packs: Postgres no admite FOR UPDATE sobre el lado nulable del LEFT JOIN.
      lock: { level: transaction.LOCK.UPDATE, of: UserPack },
    });
    if (!userPack || userPack.quantity < 1) throw new PackRequestError('No tienes este pack disponible', 404);

    const pack = (userPack as any).Pack;
    if (!pack) throw new PackRequestError('Este sobre ya no existe', 404);

    const pool = await loadPackPool(pack, transaction);

    const [pity] = await UserPackPity.findOrCreate({
      where: { user_id: userId, pack_id: pack.id },
      defaults: { user_id: userId, pack_id: pack.id, packs_without_epic: 0 },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    const randomSource = createPackRandomSource();
    let result;
    try {
      result = openPack({
        pool,
        rng: randomSource.rng,
        pityBefore: pity.packs_without_epic,
        pityThreshold: pack.pity_threshold,
        cardsPerPack: pack.cards_per_pack ?? CARDS_PER_PACK,
      });
    } catch (error) {
      if (error instanceof PackPoolError) throw new PackRequestError(error.message, 409);
      throw error;
    }

    const cardIds = [...new Set(result.cards.map(c => c.card_id))];
    const cardRows = await Card.findAll({
      where: { id: { [Op.in]: cardIds } },
      include: [
        { model: CardKnight, as: 'card_knight', required: false },
        { model: CardAbility, as: 'card_abilities', required: false },
      ],
      transaction,
    });
    const cardsById = new Map(cardRows.map((c: any) => [c.id, c]));

    const openingId = randomUUID();
    const openedCards: OpenedCard[] = [];
    for (const opened of result.cards) {
      const card = cardsById.get(opened.card_id);
      if (!card) throw new Error(`Carta del sobre no encontrada: ${opened.card_id}`);
      const isFoil = randomSource.rng.next() < FOIL_CHANCE;

      const existingUserCard = await UserCard.findOne({
        where: { user_id: userId, card_id: card.id },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (existingUserCard) {
        existingUserCard.quantity += 1;
        existingUserCard.is_foil = existingUserCard.is_foil || isFoil;
        await existingUserCard.save({ transaction });
      } else {
        await UserCard.create({ user_id: userId, card_id: card.id, quantity: 1, is_foil: isFoil }, { transaction });
      }

      // Historial de la apertura: opening_id agrupa las 5 cartas; la semilla permite reproducirla
      await transactionService.logCardTransaction(
        userId, card.id, 1, 'ACQUIRE', 'PACK_OPENING', `Carta obtenida al abrir ${pack.name}`,
        isFoil, 'pack', pack.id,
        {
          opening_id: openingId,
          pack_name: pack.name,
          card_name: card.name,
          card_rarity: opened.rarity,
          rolled_rarity: opened.rolled_rarity,
          position: opened.position,
          from_guarantee: opened.from_guarantee,
          ...(opened.from_guarantee ? { replaced_card_id: result.guarantee.replaced_card_id } : {}),
          pity_before: result.pity_before,
          pity_after: result.pity_after,
          pack_rng_seed: randomSource.seed,
        },
        transaction
      );
      openedCards.push({ card, isFoil, isNew: !existingUserCard, position: opened.position, fromGuarantee: opened.from_guarantee });
    }

    pity.packs_without_epic = result.pity_after;
    pity.changed('updated_at', true);
    await pity.save({ transaction });

    userPack.quantity -= 1;
    if (userPack.quantity > 0) await userPack.save({ transaction });
    else await userPack.destroy({ transaction });

    return {
      opening_id: openingId,
      pack,
      userPack,
      openedCards,
      guarantee: { applied: result.guarantee.applied, position: result.guarantee.position },
      progress: buildPackProgress(result.pity_after, pack.pity_threshold),
    };
  });
}
