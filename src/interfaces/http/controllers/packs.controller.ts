import { Request, Response } from 'express';
import Pack from '../../../infrastructure/database/models/Pack';
import UserPack from '../../../infrastructure/database/models/UserPack';
import {
  buildPackProgress,
  buyPackForUser,
  getPackProgressByPack,
  openPackForUser,
  PackRequestError,
  serializePack,
  serializeUserPack,
} from '../../../app/packs/pack.service';

function sendPackError(res: Response, error: unknown, logLabel: string): void {
  if (error instanceof PackRequestError) {
    res.status(error.statusCode).json({ success: false, error: error.message, ...error.details });
    return;
  }
  console.error(`${logLabel}:`, error);
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
}

// Sobres de la tienda (los "Próximamente" se muestran bloqueados: coming_soon).
// Con usuario (optionalAuthenticate), cada sobre trae `progress` de la garantía de épica.
export const getAvailablePacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId: string | undefined = (req as any).user?.id;
    const [packs, progress] = await Promise.all([
      Pack.findAll({
        where: { is_active: true },
        order: [['sort_order', 'ASC'], ['price', 'ASC']],
      }),
      userId ? getPackProgressByPack(userId) : Promise.resolve(null),
    ]);
    res.json({
      success: true,
      data: packs.map((pack) => serializePack(
        pack,
        progress ? buildPackProgress(progress.get(pack.id) ?? 0, pack.pity_threshold) : undefined,
      )),
    });
  } catch (error) {
    sendPackError(res, error, 'Error obteniendo packs');
  }
};

// Sobres sin abrir del usuario, con el progreso de la garantía de cada uno
export const getUserPacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const [userPacks, progress] = await Promise.all([
      UserPack.findAll({
        where: { user_id: userId },
        include: [{ model: Pack, as: 'Pack' }],
        order: [['acquired_at', 'DESC']],
      }),
      getPackProgressByPack(userId),
    ]);

    res.json({
      success: true,
      data: userPacks.map((userPack: any) => {
        const pack = userPack.Pack ?? userPack.toJSON?.().Pack;
        const packProgress = pack ? buildPackProgress(progress.get(pack.id) ?? 0, pack.pity_threshold) : undefined;
        return serializeUserPack(userPack, packProgress);
      }),
      total: userPacks.length,
    });
  } catch (error) {
    sendPackError(res, error, 'Error obteniendo packs del usuario');
  }
};

// Progreso de la garantía de épica en cada sobre de la tienda
export const getPacksProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const [packs, progress] = await Promise.all([
      Pack.findAll({ where: { is_active: true }, attributes: ['id', 'code', 'pity_threshold'] }),
      getPackProgressByPack(userId),
    ]);
    res.json({
      success: true,
      data: packs.map((pack) => ({
        pack_id: pack.id,
        code: pack.code,
        ...buildPackProgress(progress.get(pack.id) ?? 0, pack.pity_threshold),
      })),
    });
  } catch (error) {
    sendPackError(res, error, 'Error obteniendo el progreso de los sobres');
  }
};

// Comprar pack
export const buyPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { pack_id, quantity = 1 } = req.body;
    const purchase = await buyPackForUser(userId, pack_id, quantity);

    res.status(201).json({
      success: true,
      message: `Compraste ${quantity} ${purchase.pack.name}(s) por ${purchase.totalCost} monedas`,
      data: {
        pack: serializePack(purchase.pack),
        pack_name: purchase.pack.name,
        quantity_bought: quantity,
        total_cost: purchase.totalCost,
        currency: purchase.user.currency,
        remaining_currency: purchase.user.currency,
        user_pack_id: purchase.userPack.id
      }
    });
  } catch (error) {
    sendPackError(res, error, 'Error comprando pack');
  }
};

// Abrir pack
export const openPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { pack_id, user_pack_id } = req.body;
    const opened = await openPackForUser(userId, { userPackId: user_pack_id, packId: pack_id });

    res.json({
      success: true,
      message: `¡Abriste un ${opened.pack.name}!`,
      data: {
        opening_id: opened.opening_id,
        user_pack_id: user_pack_id || opened.userPack.id,
        pack: serializePack(opened.pack, opened.progress),
        pack_name: opened.pack.name,
        cards: opened.openedCards.map(({ card, isFoil, isNew, position, fromGuarantee }) => ({
          id: card.id,
          name: card.name,
          type: card.type,
          rarity: card.rarity,
          cost: card.cost,
          description: card.description,
          faction: card.faction,
          image_url: card.image_url,
          is_foil: isFoil,
          is_new: isNew,
          position,
          from_guarantee: fromGuarantee,
          ...(card.card_knight ? { card_knight: card.card_knight } : {}),
          ...(card.card_abilities ? { card_abilities: card.card_abilities } : {}),
        })),
        // Garantía de épica: si se aplicó y cuántos sobres faltan para la siguiente
        guarantee: opened.guarantee,
        progress: opened.progress,
        summary: {
          total_cards: opened.openedCards.length,
          by_rarity: opened.openedCards.reduce((acc, { card }) => {
            acc[card.rarity] = (acc[card.rarity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      },
    });
  } catch (error) {
    sendPackError(res, error, 'Error abriendo pack');
  }
};
