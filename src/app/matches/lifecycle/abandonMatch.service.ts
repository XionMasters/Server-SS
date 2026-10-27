import Match from '../../../infrastructure/database/models/Match';
import { sequelize } from '../../../config/database';

class AbandonError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode: number) {
    super(message);
  }
}

export class AbandonMatchService {
  /**
   * Abandona una partida activa y registra ganador al rival.
   * Bloquea la fila del match para no competir con una acción en curso.
   */
  static async abandonMatch(matchId: string, userId: string): Promise<{
    success: boolean;
    message?: string;
    match_id?: string;
    winner_id?: string;
    player_ids?: string[];
    error?: string;
    code?: string;
    statusCode?: number;
  }> {
    try {
      const match = await sequelize.transaction(async (transaction) => {
        const locked = await Match.findByPk(matchId, { transaction, lock: transaction.LOCK.UPDATE });

        if (!locked) {
          throw new AbandonError('Partida no encontrada', 'MATCH_NOT_FOUND', 404);
        }

        if (locked.player1_id !== userId && locked.player2_id !== userId) {
          throw new AbandonError('No estás en esta partida', 'UNAUTHORIZED', 403);
        }

        if (!['starting', 'player1_turn', 'player2_turn'].includes(locked.phase)) {
          throw new AbandonError('Esta partida ya ha finalizado', 'MATCH_ALREADY_FINISHED', 400);
        }

        const winnerId = locked.player1_id === userId ? locked.player2_id : locked.player1_id;

        if (!winnerId) {
          throw new AbandonError('Error: no se puede determinar el ganador', 'INVALID_MATCH_STATE', 400);
        }

        locked.winner_id = winnerId as string;
        locked.phase = 'finished';
        locked.finished_at = new Date();
        await locked.save({ transaction });
        return locked;
      });

      return {
        success: true,
        message: 'Partida abandonada correctamente',
        match_id: matchId,
        winner_id: match.winner_id as string,
        player_ids: [...new Set([match.player1_id, match.player2_id].filter(Boolean))] as string[]
      };
    } catch (error: any) {
      if (error instanceof AbandonError) {
        return { success: false, error: error.message, code: error.code, statusCode: error.statusCode };
      }

      console.error('Error abandonando partida:', error);
      return {
        success: false,
        error: 'Error abandonando partida',
        code: 'ABANDON_ERROR',
        statusCode: 500
      };
    }
  }
}
