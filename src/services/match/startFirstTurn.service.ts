import Match from '../../models/Match';
import { MatchStateService } from './matchState.service';
import { applyHandVisibility } from '../serializers/handVisibility';

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

      const matchData = matchStateResult.data;
      const isTestMatch = match.player1_id === match.player2_id;

      if (isTestMatch) {
        // TEST: player1 arranca con turno → ve su mano, player2 ve dorsos
        const payload = {
          ...matchData,
          perspective_player: 1,
          cards_in_play: applyHandVisibility(matchData.cards_in_play || [], 1, 2)  // DEBUG: revelar 3ra carta del oponente
        };
        return {
          success: true,
          events: [
            {
              type: 'turn_changed',
              payload,
              recipients: { type: 'users', userIds: [match.player1_id].filter(Boolean) }
            }
          ]
        };
      }

      // PvP: cada jugador ve su propia mano, la del rival como dorsos
      const forPlayer = (playerNumber: number) => ({
        ...matchData,
        perspective_player: playerNumber,
        cards_in_play: applyHandVisibility(matchData.cards_in_play || [], playerNumber)
      });

      return {
        success: true,
        events: [
          {
            type: 'turn_changed',
            payload: forPlayer(1),
            recipients: { type: 'users', userIds: [match.player1_id].filter(Boolean) }
          },
          {
            type: 'turn_changed',
            payload: forPlayer(2),
            recipients: { type: 'users', userIds: [match.player2_id].filter(Boolean) }
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
