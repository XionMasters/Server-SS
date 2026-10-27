import { sequelize } from '../../config/database';
import UserCard from '../../infrastructure/database/models/UserCard';
import Card from '../../infrastructure/database/models/Card';
import CardKnight from '../../infrastructure/database/models/CardKnight';
import CardAbility from '../../infrastructure/database/models/CardAbility';

interface UserCardWithCard extends UserCard {
  card: Card & { card_knight?: CardKnight; card_abilities?: CardAbility[] };
}

export class CollectionService {
  static async getUserCards(userId: string) {
    const userCards = await UserCard.findAll({
      where: { user_id: userId },
      include: [{
        model: Card,
        as: 'card',
        include: [
          { model: CardKnight, as: 'card_knight', attributes: ['attack', 'defense', 'health', 'cosmos'] },
          { model: CardAbility, as: 'card_abilities', attributes: ['name', 'type', 'description', 'conditions', 'effects'] },
        ],
      }],
      order: [['acquired_at', 'DESC']],
    }) as UserCardWithCard[];

    return userCards.map((userCard) => ({
      id: userCard.card_id,
      quantity: userCard.quantity,
      is_foil: userCard.is_foil,
      acquired_at: userCard.acquired_at,
      card: {
        id: userCard.card.id,
        name: userCard.card.name,
        type: userCard.card.type,
        rarity: userCard.card.rarity,
        cost: userCard.card.cost,
        description: userCard.card.description,
        faction: userCard.card.faction,
        image_url: userCard.card.image_url,
        knight_attributes: userCard.card.card_knight,
        abilities: userCard.card.card_abilities,
      },
    }));
  }

  static async getUserCardStats(userId: string) {
    const stats = await UserCard.findAll({
      where: { user_id: userId },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('card_id')), 'total_cards'],
        [sequelize.fn('SUM', sequelize.col('quantity')), 'total_copies'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN is_foil THEN 1 ELSE 0 END')), 'foil_cards'],
      ],
      raw: true,
    }) as unknown as Array<{ total_cards: string; total_copies: string; foil_cards: string }>;

    const rarityStats = await UserCard.findAll({
      where: { user_id: userId },
      include: [{ model: Card, as: 'card' }],
      attributes: ['card.rarity', [sequelize.fn('COUNT', sequelize.col('card_id')), 'count']],
      group: ['card.rarity'],
      raw: true,
    });

    return {
      total_cards: parseInt(stats[0]?.total_cards || '0'),
      total_copies: parseInt(stats[0]?.total_copies || '0'),
      foil_cards: parseInt(stats[0]?.foil_cards || '0'),
      by_rarity: rarityStats,
    };
  }
}
