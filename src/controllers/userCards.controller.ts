// src/controllers/userCards.controller.ts
import { Request, Response } from 'express';
import { sequelize } from '../config/database';
import UserCard from '../models/UserCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';

// Interfaces para los datos incluidos
interface UserCardWithCard extends UserCard {
  card: Card & {
    card_knight?: CardKnight;
    card_abilities?: CardAbility[];
  };
}

export const getUserCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    const userCards = await UserCard.findAll({
      where: { user_id: userId },
      include: [
        {
          model: Card,
          as: 'card',
          include: [
            {
              model: CardKnight,
              as: 'card_knight',
              attributes: ['attack', 'defense', 'health', 'cosmos']
            },
            {
              model: CardAbility,
              as: 'card_abilities',
              attributes: ['name', 'type', 'description', 'conditions', 'effects']
            }
          ]
        }
      ],
      order: [['acquired_at', 'DESC']]
    }) as UserCardWithCard[];

    // Formatear la respuesta
    const collection = userCards.map(uc => ({
      id: uc.card_id,
      quantity: uc.quantity,
      is_foil: uc.is_foil,
      acquired_at: uc.acquired_at,
      card: {
        id: uc.card.id,
        name: uc.card.name,
        type: uc.card.type,
        rarity: uc.card.rarity,
        cost: uc.card.cost,
        description: uc.card.description,
        faction: uc.card.faction,
        image_url: uc.card.image_url,
        knight_attributes: uc.card.card_knight,
        abilities: uc.card.card_abilities
      }
    }));

    res.json({
      success: true,
      data: collection,
      total: collection.length
    });

  } catch (error) {
    console.error('Error obteniendo colección:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
};

export const addUserCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;
    const { card_id, quantity = 1, is_foil = false } = req.body;

    if (!card_id) {
      res.status(400).json({ 
        success: false, 
        error: 'card_id es requerido' 
      });
      return;
    }

    // Verificar si la carta existe
    const card = await Card.findByPk(card_id);
    if (!card) {
      res.status(404).json({ 
        success: false, 
        error: 'Carta no encontrada' 
      });
      return;
    }

    // Buscar si el usuario ya tiene esta carta
    const existingUserCard = await UserCard.findOne({
      where: { user_id: userId, card_id }
    });

    if (existingUserCard) {
      // Incrementar cantidad si ya existe
      existingUserCard.quantity += quantity;
      await existingUserCard.save();
    } else {
      // Crear nueva entrada
      await UserCard.create({
        user_id: userId,
        card_id,
        quantity,
        is_foil
      });
    }

    // Obtener la carta actualizada
    const updatedUserCard = await UserCard.findOne({
      where: { user_id: userId, card_id },
      include: [{
        model: Card,
        as: 'card'
      }]
    });

    res.status(201).json({
      success: true,
      message: 'Carta agregada a la colección',
      data: updatedUserCard
    });

  } catch (error) {
    console.error('Error agregando carta:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
};

export const getUserCardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Interfaz para los resultados de stats
    interface StatsRow {
      total_cards: string;
      total_copies: string;
      foil_cards: string;
    }

    interface RarityStatsRow {
      'card.rarity': string;
      count: string;
    }

    const stats = await UserCard.findAll({
      where: { user_id: userId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('card_id')), 'total_cards'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'total_copies'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN is_foil THEN 1 ELSE 0 END')), 'foil_cards']
      ],
      raw: true
    }) as unknown as StatsRow[];

    // Contar por rareza
    const rarityStats = await UserCard.findAll({
      where: { user_id: userId },
      include: [{
        model: Card,
        as: 'card'
      }],
      attributes: [
        'card.rarity',
        [sequelize.fn('COUNT', sequelize.col('card_id')), 'count']
      ],
      group: ['card.rarity'],
      raw: true
    }) as unknown as RarityStatsRow[];

    res.json({
      success: true,
      data: {
        total_cards: parseInt(stats[0]?.total_cards || '0'),
        total_copies: parseInt(stats[0]?.total_copies || '0'),
        foil_cards: parseInt(stats[0]?.foil_cards || '0'),
        by_rarity: rarityStats
      }
    });

  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
};