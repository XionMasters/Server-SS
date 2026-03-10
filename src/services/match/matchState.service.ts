import Match from '../../models/Match';
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardInPlay from '../../models/CardInPlay';
import User from '../../models/User';
import { GameStateBuilder } from '../game/GameStateBuilder';
import { serializeCardInPlay } from '../serializers/cardInPlay.serializer';

export class MatchStateService {
  /**
   * Construye estado de partida completo para broadcast (WS/HTTP).
   */
  static async buildBroadcastMatchState(matchId: string): Promise<{
    success: boolean;
    code?: string;
    error?: string;
    data?: any;
  }> {
    try {
      const match = await Match.findByPk(matchId, {
        include: [
          { model: User, as: 'player1', attributes: ['id', 'username'] },
          { model: User, as: 'player2', attributes: ['id', 'username'] }
        ]
      });

      if (!match) {
        return {
          success: false,
          code: 'MATCH_NOT_FOUND',
          error: 'Partida no encontrada'
        };
      }

      const cardsInPlay = await CardInPlay.findAll({
        where: { match_id: matchId },
        include: [
          {
            model: Card,
            as: 'card',
            attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description', 'faction', 'element'],
            include: [{ model: CardKnight, as: 'card_knight' }]
          }
        ]
      });

      const cardsData = cardsInPlay.map(serializeCardInPlay);

      const player1HandCount = cardsInPlay.filter((c: any) => c.player_number === 1 && c.zone === 'hand').length;
      const player2HandCount = cardsInPlay.filter((c: any) => c.player_number === 2 && c.zone === 'hand').length;
      const player1DeckSize = cardsInPlay.filter((c: any) => c.player_number === 1 && c.zone === 'deck').length;
      const player2DeckSize = cardsInPlay.filter((c: any) => c.player_number === 2 && c.zone === 'deck').length;
      const player1GraveyardCount = cardsInPlay.filter((c: any) => c.player_number === 1 && c.zone === 'yomotsu').length;
      const player2GraveyardCount = cardsInPlay.filter((c: any) => c.player_number === 2 && c.zone === 'yomotsu').length;

      return {
        success: true,
        data: {
          id: match.id,
          match_id: match.id,
          player1_id: match.player1_id,
          player1_name: (match.get('player1') as any)?.username,
          player2_id: match.player2_id,
          player2_name: (match.get('player2') as any)?.username,
          current_turn: match.current_turn,
          current_player: match.current_player,
          phase: match.phase,
          current_phase: match.phase,
          winner_id: match.winner_id ?? null,
          player1_life: match.player1_life,
          player2_life: match.player2_life,
          player1_cosmos: match.player1_cosmos,
          player2_cosmos: match.player2_cosmos,
          player1_hand_count: player1HandCount,
          player2_hand_count: player2HandCount,
          player1_deck_size: player1DeckSize,
          player2_deck_size: player2DeckSize,
          player1_graveyard_count: player1GraveyardCount,
          player2_graveyard_count: player2GraveyardCount,
          cards_in_play: cardsData
        }
      };
    } catch (error: any) {
      return {
        success: false,
        code: 'MATCH_STATE_ERROR',
        error: error?.message || 'Error construyendo estado de partida'
      };
    }
  }

  /**
   * Obtiene estado de partida validando membresía del usuario.
   */
  static async getMatchStateForUser(matchId: string, userId: string): Promise<{
    success: boolean;
    statusCode?: number;
    code?: string;
    error?: string;
    data?: any;
  }> {
    try {
      const match = await Match.findByPk(matchId);

      if (!match) {
        return {
          success: false,
          statusCode: 404,
          code: 'MATCH_NOT_FOUND',
          error: 'Partida no encontrada'
        };
      }

      if (match.player1_id !== userId && match.player2_id !== userId) {
        return {
          success: false,
          statusCode: 403,
          code: 'NOT_IN_MATCH',
          error: 'No eres parte de esta partida'
        };
      }

      const gameState = await GameStateBuilder.buildFromMatch(match);

      return {
        success: true,
        data: gameState
      };
    } catch (error: any) {
      return {
        success: false,
        statusCode: 500,
        code: 'MATCH_STATE_ERROR',
        error: error?.message || 'Error obteniendo estado de partida'
      };
    }
  }
}
