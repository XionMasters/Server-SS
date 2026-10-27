import { Op } from 'sequelize';
import { AdminMatchRepository, MatchRecord } from '../../../app/admin/match-inspection';
import { Card, CardInPlay, CardKnight, Match, User } from '../models/associations';

const playersInclude = () => [
  { model: User, as: 'player1', attributes: ['id', 'username'] },
  { model: User, as: 'player2', attributes: ['id', 'username'] },
];

export class SequelizeAdminMatchRepository implements AdminMatchRepository {
  async findActiveMatches(limit: number): Promise<MatchRecord[]> {
    const matches = await Match.findAll({
      where: { phase: { [Op.ne]: 'finished' } },
      include: playersInclude(),
      order: [['created_at', 'DESC']],
      limit,
    });

    return matches.map((match) => match.toJSON() as MatchRecord);
  }

  async findMatchForInspection(matchId: string): Promise<MatchRecord | null> {
    const match = await Match.findByPk(matchId, {
      include: [
        ...playersInclude(),
        {
          model: CardInPlay,
          as: 'cards_in_play',
          include: [{
            model: Card,
            as: 'card',
            attributes: ['id', 'name', 'type', 'rarity', 'cost', 'element', 'faction', 'image_url'],
            include: [{ model: CardKnight, as: 'card_knight', attributes: ['attack', 'defense', 'health', 'cosmos'] }],
          }],
        },
      ],
    });

    return match ? (match.toJSON() as MatchRecord) : null;
  }
}
