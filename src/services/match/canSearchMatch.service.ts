import { Op } from 'sequelize';
import Match from '../../models/Match';
import Deck from '../../models/Deck';
import Card from '../../models/Card';
import { validateExistingDeck } from '../../utils/deckValidator';

export interface CanSearchResult {
  can_search: boolean;
  reason: 'OK' | 'ALREADY_IN_MATCH' | 'NO_ACTIVE_DECK' | 'INVALID_DECK' | 'SERVER_ERROR';
  message: string;
  match?: {
    id: string;
    phase: string;
  };
  deck?: {
    id: string;
    name: string;
    total_cards?: number;
  } | null;
  errors?: string[];
  warnings?: string[];
}

export class CanSearchMatchService {
  static async evaluate(userId: string, username?: string): Promise<CanSearchResult> {
    const existingMatch = await Match.findOne({
      where: {
        [Op.or]: [
          {
            player1_id: userId,
            phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] }
          },
          {
            player2_id: userId,
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
          }
        ]
      }
    });

    if (existingMatch) {
      const isSearching = existingMatch.phase === 'waiting';

      if (!isSearching) {
        return {
          can_search: false,
          reason: 'ALREADY_IN_MATCH',
          message: 'Ya estás en una partida activa',
          match: {
            id: existingMatch.id,
            phase: existingMatch.phase
          }
        };
      }

      if (username) {
        console.log(`ℹ️ Usuario ${username} tiene partida en waiting, se limpiará al buscar`);
      }
    }

    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] }
        }
      ]
    });

    if (!activeDeck) {
      return {
        can_search: false,
        reason: 'NO_ACTIVE_DECK',
        message: 'No tienes un mazo marcado como activo',
        deck: null
      };
    }

    const validation = await validateExistingDeck(activeDeck.id);

    if (!validation.valid) {
      return {
        can_search: false,
        reason: 'INVALID_DECK',
        message: 'Tu mazo activo no cumple con las reglas',
        deck: {
          id: activeDeck.id,
          name: activeDeck.name
        },
        errors: validation.errors,
        warnings: validation.warnings
      };
    }

    const totalCards = (activeDeck as any).cards?.reduce((sum: number, card: any) => {
      return sum + (card.DeckCard?.quantity || 0);
    }, 0) || 0;

    return {
      can_search: true,
      reason: 'OK',
      message: 'Listo para buscar partida',
      deck: {
        id: activeDeck.id,
        name: activeDeck.name,
        total_cards: totalCards
      },
      warnings: validation.warnings
    };
  }
}
