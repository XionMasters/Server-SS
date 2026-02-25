import { Op } from 'sequelize';
import Match from '../../models/Match';
import User from '../../models/User';

export interface MatchRecoveryResult {
  cleanedWaitingCount: number;
  matchResumed?: {
    match_id: string;
    phase: string;
    player1: { id: string; username?: string };
    player2: { id: string | null; username?: string };
    player1_life: number;
    player2_life: number;
    player1_cosmos: number;
    player2_cosmos: number;
    current_turn: number;
    current_player: number;
  };
}

export class MatchRecoveryService {
  static async recoverOnConnect(
    userId: string,
    isUserOnline: (userId: string) => boolean
  ): Promise<MatchRecoveryResult> {
    let cleanedWaitingCount = 0;

    const oldMatches = await Match.findAll({
      where: {
        player1_id: userId,
        phase: 'waiting'
      }
    });

    if (oldMatches.length > 0) {
      for (const match of oldMatches) {
        await match.destroy();
      }
      cleanedWaitingCount = oldMatches.length;
    }

    const activeMatch = await Match.findOne({
      where: {
        [Op.or]: [
          {
            player1_id: userId,
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
          },
          {
            player2_id: userId,
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
          }
        ]
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (!activeMatch) {
      return { cleanedWaitingCount };
    }

    const player1 = activeMatch.get('player1') as any;
    const player2 = activeMatch.get('player2') as any;

    if (!player1 || !player2) {
      await activeMatch.destroy();
      return { cleanedWaitingCount };
    }

    const isTestMode = activeMatch.player1_id === activeMatch.player2_id;

    if (!isTestMode) {
      const otherPlayerId = activeMatch.player1_id === userId ? activeMatch.player2_id : activeMatch.player1_id;
      const otherPlayerSocketOnline = !!otherPlayerId && isUserOnline(otherPlayerId);

      if (!otherPlayerSocketOnline) {
        await activeMatch.destroy();
        return { cleanedWaitingCount };
      }
    }

    return {
      cleanedWaitingCount,
      matchResumed: {
        match_id: activeMatch.id,
        phase: activeMatch.phase,
        player1: {
          id: activeMatch.player1_id,
          username: player1?.username
        },
        player2: {
          id: activeMatch.player2_id,
          username: player2?.username
        },
        player1_life: activeMatch.player1_life,
        player2_life: activeMatch.player2_life,
        player1_cosmos: activeMatch.player1_cosmos,
        player2_cosmos: activeMatch.player2_cosmos,
        current_turn: activeMatch.current_turn,
        current_player: activeMatch.current_player
      }
    };
  }
}
