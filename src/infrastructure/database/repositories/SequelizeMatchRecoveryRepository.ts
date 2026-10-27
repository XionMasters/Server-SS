import { Op } from 'sequelize';
import {
  MatchRecoveryRepository,
  RecoverableMatch,
} from '../../../app/matches/recover-match-on-connect.use-case';
import Match from '../models/Match';
import User from '../models/User';

function toParticipant(value: unknown, id: string): RecoverableMatch['player1'] {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const username = 'username' in value && typeof value.username === 'string'
    ? value.username
    : undefined;

  return username ? { id, username } : { id };
}

export class SequelizeMatchRecoveryRepository implements MatchRecoveryRepository {
  async clearWaitingMatches(userId: string): Promise<number> {
    const waitingMatches = await Match.findAll({
      where: {
        player1_id: userId,
        phase: 'waiting',
      },
    });

    for (const match of waitingMatches) {
      await match.destroy();
    }

    return waitingMatches.length;
  }

  async findActiveMatch(userId: string): Promise<RecoverableMatch | null> {
    const activeMatch = await Match.findOne({
      where: {
        [Op.or]: [
          {
            player1_id: userId,
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] },
          },
          {
            player2_id: userId,
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] },
          },
        ],
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] },
      ],
    });

    if (!activeMatch) {
      return null;
    }

    return {
      id: activeMatch.id,
      phase: activeMatch.phase,
      player1_id: activeMatch.player1_id,
      player2_id: activeMatch.player2_id,
      player1_life: activeMatch.player1_life,
      player2_life: activeMatch.player2_life,
      player1_cosmos: activeMatch.player1_cosmos,
      player2_cosmos: activeMatch.player2_cosmos,
      current_turn: activeMatch.current_turn,
      current_player: activeMatch.current_player,
      player1: toParticipant(activeMatch.get('player1'), activeMatch.player1_id),
      player2: activeMatch.player2_id
        ? toParticipant(activeMatch.get('player2'), activeMatch.player2_id)
        : null,
    };
  }

  async deleteMatch(matchId: string): Promise<void> {
    await Match.destroy({ where: { id: matchId } });
  }
}
