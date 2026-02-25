import Match from '../../models/Match';

export class AbandonMatchService {
  /**
   * Abandona una partida activa y registra ganador al rival.
   */
  static async abandonMatch(matchId: string, userId: string): Promise<{
    success: boolean;
    message?: string;
    match_id?: string;
    winner_id?: string;
    error?: string;
    code?: string;
    statusCode?: number;
  }> {
    try {
      const match = await Match.findByPk(matchId);

      if (!match) {
        return {
          success: false,
          error: 'Partida no encontrada',
          code: 'MATCH_NOT_FOUND',
          statusCode: 404
        };
      }

      if (match.player1_id !== userId && match.player2_id !== userId) {
        return {
          success: false,
          error: 'No estás en esta partida',
          code: 'UNAUTHORIZED',
          statusCode: 403
        };
      }

      if (!['starting', 'player1_turn', 'player2_turn'].includes(match.phase)) {
        return {
          success: false,
          error: 'Esta partida ya ha finalizado',
          code: 'MATCH_ALREADY_FINISHED',
          statusCode: 400
        };
      }

      const winnerId = match.player1_id === userId ? match.player2_id : match.player1_id;

      if (!winnerId) {
        return {
          success: false,
          error: 'Error: no se puede determinar el ganador',
          code: 'INVALID_MATCH_STATE',
          statusCode: 400
        };
      }

      match.winner_id = winnerId as string;
      match.phase = 'finished';
      match.finished_at = new Date();
      await match.save();

      return {
        success: true,
        message: 'Partida abandonada correctamente',
        match_id: matchId,
        winner_id: winnerId
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || 'Error abandonando partida',
        code: 'ABANDON_ERROR',
        statusCode: 400
      };
    }
  }
}
