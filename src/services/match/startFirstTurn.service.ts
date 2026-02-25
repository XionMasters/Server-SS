import Match from '../../models/Match';
import { MatchStateService } from './matchState.service';

export class StartFirstTurnService {
  static async execute(matchId: string, userId: string): Promise<any> {
    try {
      const match = await Match.findByPk(matchId);

      if (!match) {
        return {
          success: false,
          code: 'MATCH_NOT_FOUND',
          error: 'Partida no encontrada'
        };
      }

      if (match.player1_id !== userId && match.player2_id !== userId) {
        return {
          success: false,
          code: 'NOT_IN_MATCH',
          error: 'No perteneces a esta partida'
        };
      }

      if (match.phase !== 'starting') {
        return {
          success: false,
          code: 'MATCH_ALREADY_STARTED',
          error: 'Partida ya ha iniciado'
        };
      }

      match.phase = 'player1_turn';
      match.current_player = 1;
      match.current_turn = 1;
      match.player1_cosmos = Math.min((match.player1_cosmos || 0) + 1, 12);

      const player1DeckOrder = JSON.parse((match as any).player1_deck_order || '[]');
      let player1DeckIndex = (match as any).player1_deck_index || 5;

      if (player1DeckIndex < player1DeckOrder.length) {
        player1DeckIndex++;
        (match as any).player1_deck_index = player1DeckIndex;
      }

      await match.save();

      const matchStateResult = await MatchStateService.buildBroadcastMatchState(matchId);
      if (!matchStateResult.success || !matchStateResult.data) {
        return {
          success: false,
          code: matchStateResult.code || 'MATCH_STATE_ERROR',
          error: matchStateResult.error || 'No se pudo construir estado de partida'
        };
      }

      return {
        success: true,
        events: [
          {
            type: 'turn_changed',
            payload: matchStateResult.data,
            recipients: {
              type: 'users',
              userIds: [match.player1_id, match.player2_id].filter(Boolean)
            }
          }
        ]
      };
    } catch (error: any) {
      return {
        success: false,
        code: 'START_FIRST_TURN_ERROR',
        error: error?.message || 'Error iniciando primer turno'
      };
    }
  }
}
