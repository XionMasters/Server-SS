import { Request, Response } from 'express';
import { sequelize } from '../../../config/database';
import Pack from '../../../infrastructure/database/models/Pack';
import UserPack from '../../../infrastructure/database/models/UserPack';
import User from '../../../infrastructure/database/models/User';
import UserCard from '../../../infrastructure/database/models/UserCard';
import transactionService from '../../../infrastructure/database/services/transaction.service';
import {
  buyPackForUser,
  createPackRandomSource,
  generateRandomCard,
  normalizePackRarity,
  PackRequestError,
  serializePack,
  serializeUserPack,
} from '../../../app/packs/pack.service';

// Obtener todos los packs disponibles
export const getAvailablePacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const packs = await Pack.findAll({
      where: { is_active: true },
      order: [['price', 'ASC']]
    });

    res.json({
      success: true,
      data: packs.map((pack) => serializePack(pack))
    });

  } catch (error) {
    console.error('Error obteniendo packs:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// Obtener packs del usuario
export const getUserPacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const userPacks = await UserPack.findAll({
      where: { user_id: userId },
      include: [{
        model: Pack,
        as: 'Pack'
      }],
      order: [['acquired_at', 'DESC']]
    });

    res.json({
      success: true,
      data: userPacks.map((userPack) => serializeUserPack(userPack)),
      total: userPacks.length
    });

  } catch (error) {
    console.error('Error obteniendo packs del usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
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
    if (error instanceof PackRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
        ...error.details,
      });
      return;
    }

    console.error('Error comprando pack:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// Abrir pack
export const openPack = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { pack_id, user_pack_id } = req.body;

    // Aceptar tanto pack_id como user_pack_id para compatibilidad
    const searchId = user_pack_id || pack_id;

    if (!searchId) {
      throw new PackRequestError('pack_id o user_pack_id es requerido', 400);
    }

    const openedPack = await sequelize.transaction(async (transaction) => {
      const whereClause = user_pack_id
        ? { id: user_pack_id, user_id: userId }
        : { user_id: userId, pack_id: searchId };

      const userPack = await UserPack.findOne({
        where: whereClause,
        include: [{ model: Pack, as: 'Pack' }],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!userPack || userPack.quantity < 1) {
        throw new PackRequestError('No tienes este pack disponible', 404);
      }

      const pack = (userPack as any).Pack;
      const guaranteedRarity = normalizePackRarity(pack.guaranteed_rarity);
      const randomSource = createPackRandomSource();
      const generatedCards: any[] = [];
      let hasGuaranteed = false;

      for (let i = 0; i < pack.cards_per_pack; i++) {
        const cardRarity = i === pack.cards_per_pack - 1 && guaranteedRarity && !hasGuaranteed
          ? guaranteedRarity
          : undefined;
        const card = await generateRandomCard(transaction, randomSource.rng, cardRarity);
        generatedCards.push(card);

        if (guaranteedRarity && card.rarity === guaranteedRarity) {
          hasGuaranteed = true;
        }
      }

      const openedCards: Array<{ card: any; isFoil: boolean }> = [];
      for (const card of generatedCards) {
        const isFoil = randomSource.rng.next() < 0.05;
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
          await UserCard.create({
            user_id: userId,
            card_id: card.id,
            quantity: 1,
            is_foil: isFoil,
          }, { transaction });
        }

        await transactionService.logCardTransaction(
          userId,
          card.id,
          1,
          'ACQUIRE',
          'PACK_OPENING',
          `Carta obtenida al abrir ${pack.name}`,
          isFoil,
          'pack',
          pack.id,
          {
            pack_name: pack.name,
            card_name: card.name,
            card_rarity: card.rarity,
            pack_rng_seed: randomSource.seed,
            pack_rng_state_after_card: randomSource.rng.getSeed(),
          },
          transaction
        );
        openedCards.push({ card, isFoil });
      }

      userPack.quantity -= 1;
      if (userPack.quantity > 0) {
        await userPack.save({ transaction });
      } else {
        await userPack.destroy({ transaction });
      }

      return { pack, userPack, openedCards };
    });

    res.json({
      success: true,
      message: `¡Abriste un ${openedPack.pack.name}!`,
      data: {
        user_pack_id: user_pack_id || openedPack.userPack.id,
        pack: serializePack(openedPack.pack),
        pack_name: openedPack.pack.name,
        cards: openedPack.openedCards.map(({ card, isFoil }) => {
          const cardData: any = {
            id: card.id,
            name: card.name,
            type: card.type,
            rarity: card.rarity,
            cost: card.cost,
            description: card.description,
            faction: card.faction,
            image_url: card.image_url,
            is_foil: isFoil
          };
          
          // Incluir datos de caballero si existen
          if ((card as any).card_knight) {
            cardData.card_knight = (card as any).card_knight;
          }
          
          // Incluir habilidades si existen
          if ((card as any).card_abilities) {
            cardData.card_abilities = (card as any).card_abilities;
          }
          
          return cardData;
        }),
        summary: {
          total_cards: openedPack.openedCards.length,
          by_rarity: openedPack.openedCards.reduce((acc, { card }) => {
            acc[card.rarity] = (acc[card.rarity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      }
    });

  } catch (error) {
    if (error instanceof PackRequestError) {
      res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
      return;
    }

    console.error('Error abriendo pack:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};