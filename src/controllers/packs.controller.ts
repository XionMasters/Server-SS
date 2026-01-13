// src/controllers/packs.controller.ts
import { Request, Response } from 'express';
import { sequelize } from '../config/database';
import Pack from '../models/Pack';
import UserPack from '../models/UserPack';
import User from '../models/User';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';
import UserCard from '../models/UserCard';
import transactionService from '../services/transactionService';

// Configuración de probabilidades por rareza
const RARITY_WEIGHTS = {
  'comun': 60,     // 60%
  'rara': 25,      // 25%
  'epica': 12,     // 12%
  'legendaria': 3  // 3%
};

// Obtener todos los packs disponibles
export const getAvailablePacks = async (req: Request, res: Response): Promise<void> => {
  try {
    const packs = await Pack.findAll({
      where: { is_active: true },
      order: [['price', 'ASC']]
    });

    res.json({
      success: true,
      data: packs
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
      data: userPacks,
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
  const transaction = await sequelize.transaction();
  
  try {
    const userId = (req as any).user.id;
    const { pack_id, quantity = 1 } = req.body;

    if (!pack_id) {
      res.status(400).json({
        success: false,
        error: 'pack_id es requerido'
      });
      return;
    }

    if (quantity < 1 || quantity > 10) {
      res.status(400).json({
        success: false,
        error: 'La cantidad debe estar entre 1 y 10'
      });
      return;
    }

    // Verificar que el pack existe y está activo
    const pack = await Pack.findOne({
      where: { id: pack_id, is_active: true }
    });

    if (!pack) {
      res.status(404).json({
        success: false,
        error: 'Pack no encontrado o no disponible'
      });
      return;
    }

    // Obtener usuario actual
    const user = await User.findByPk(userId, { transaction });
    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
      return;
    }

    // Verificar que el usuario tiene suficientes monedas
    const totalCost = pack.price * quantity;
    if (user.currency < totalCost) {
      res.status(400).json({
        success: false,
        error: 'Monedas insuficientes',
        required: totalCost,
        available: user.currency
      });
      return;
    }

    // Descontar monedas
    user.currency -= totalCost;
    await user.save({ transaction });

    // ✅ REGISTRAR TRANSACCIÓN DE GASTO
    await transactionService.logCurrencyTransaction(
      userId,
      totalCost,
      'SPEND',
      'PACK_PURCHASE',
      `Compra de ${quantity}x ${pack.name}`,
      'pack',
      pack_id,
      { pack_name: pack.name, quantity }
    );

    // Agregar packs al inventario del usuario
    let userPack = await UserPack.findOne({
      where: { user_id: userId, pack_id: pack_id },
      transaction
    });

    if (userPack) {
      userPack.quantity += quantity;
      await userPack.save({ transaction });
    } else {
      userPack = await UserPack.create({
        user_id: userId,
        pack_id: pack_id,
        quantity: quantity
      }, { transaction });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Compraste ${quantity} ${pack.name}(s) por ${totalCost} monedas`,
      data: {
        pack_name: pack.name,
        quantity_bought: quantity,
        total_cost: totalCost,
        remaining_currency: user.currency,
        user_pack_id: userPack.id  // ✅ Devolver el ID del UserPack
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error comprando pack:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

// Función para generar carta aleatoria basada en probabilidades
const generateRandomCard = async (guaranteedRarity?: string): Promise<any> => {
  let targetRarity = guaranteedRarity;
  
  if (!targetRarity) {
    // Generar rareza aleatoria basada en pesos
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      cumulative += weight;
      if (random <= cumulative) {
        targetRarity = rarity;
        break;
      }
    }
  }

  // Obtener cartas de la rareza seleccionada
  const cards = await Card.findAll({
    where: { rarity: targetRarity },
    include: [
      {
        model: CardKnight,
        as: 'card_knight',
        required: false
      },
      {
        model: CardAbility,
        as: 'card_abilities',
        required: false
      }
    ]
  });

  if (cards.length === 0) {
    // Fallback a común si no hay cartas de la rareza
    const fallbackCards = await Card.findAll({
      where: { rarity: 'comun' },
      include: [
        {
          model: CardKnight,
          as: 'card_knight',
          required: false
        },
        {
          model: CardAbility,
          as: 'card_abilities',
          required: false
        }
      ]
    });
    return fallbackCards[Math.floor(Math.random() * fallbackCards.length)];
  }

  return cards[Math.floor(Math.random() * cards.length)];
};

// Abrir pack
export const openPack = async (req: Request, res: Response): Promise<void> => {
  const transaction = await sequelize.transaction();
  
  try {
    const userId = (req as any).user.id;
    const { pack_id, user_pack_id } = req.body;

    // Aceptar tanto pack_id como user_pack_id para compatibilidad
    const searchId = user_pack_id || pack_id;

    if (!searchId) {
      res.status(400).json({
        success: false,
        error: 'pack_id o user_pack_id es requerido'
      });
      return;
    }

    // Verificar que el usuario tiene el pack
    // Si viene user_pack_id, buscar por ID del registro UserPack
    // Si viene pack_id, buscar por pack_id
    const whereClause = user_pack_id 
      ? { id: user_pack_id, user_id: userId }
      : { user_id: userId, pack_id: searchId };

    const userPack = await UserPack.findOne({
      where: whereClause,
      include: [{
        model: Pack,
        as: 'Pack'
      }],
      transaction
    });

    if (!userPack || userPack.quantity < 1) {
      res.status(404).json({
        success: false,
        error: 'No tienes este pack disponible'
      });
      return;
    }

    const pack = (userPack as any).Pack;
    const cardsToGenerate = pack.cards_per_pack;
    const guaranteedRarity = pack.guaranteed_rarity;
    
    // Generar cartas
    const generatedCards = [];
    let hasGuaranteed = false;

    for (let i = 0; i < cardsToGenerate; i++) {
      let cardRarity = undefined;
      
      // En la última carta, asegurar rareza garantizada si no ha salido
      if (i === cardsToGenerate - 1 && guaranteedRarity && !hasGuaranteed) {
        cardRarity = guaranteedRarity;
      }
      
      const card = await generateRandomCard(cardRarity);
      generatedCards.push(card);
      
      // Verificar si ya obtuvimos la rareza garantizada
      if (guaranteedRarity && card.rarity === guaranteedRarity) {
        hasGuaranteed = true;
      }
    }

    // Agregar cartas a la colección del usuario
    for (const card of generatedCards) {
      const isfoil = Math.random() < 0.05; // 5% chance de foil
      
      const existingUserCard = await UserCard.findOne({
        where: { user_id: userId, card_id: card.id },
        transaction
      });

      if (existingUserCard) {
        existingUserCard.quantity += 1;
        await existingUserCard.save({ transaction });
      } else {
        await UserCard.create({
          user_id: userId,
          card_id: card.id,
          quantity: 1,
          is_foil: isfoil
        }, { transaction });
      }

      // ✅ REGISTRAR TRANSACCIÓN DE CARTA
      await transactionService.logCardTransaction(
        userId,
        card.id,
        1,
        'ACQUIRE',
        'PACK_OPENING',
        `Carta obtenida al abrir ${pack.name}`,
        isfoil,
        'pack',
        pack_id,
        { pack_name: pack.name, card_name: card.name, card_rarity: card.rarity }
      );
    }

    // Reducir cantidad de packs
    userPack.quantity -= 1;
    if (userPack.quantity > 0) {
      await userPack.save({ transaction });
    } else {
      await userPack.destroy({ transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: `¡Abriste un ${pack.name}!`,
      data: {
        pack_name: pack.name,
        cards: generatedCards.map(card => {
          const cardData: any = {
            id: card.id,
            name: card.name,
            type: card.type,
            rarity: card.rarity,
            cost: card.cost,
            description: card.description,
            faction: card.faction,
            image_url: card.image_url,
            is_foil: Math.random() < 0.05
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
          total_cards: generatedCards.length,
          by_rarity: generatedCards.reduce((acc, card) => {
            acc[card.rarity] = (acc[card.rarity] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error abriendo pack:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};