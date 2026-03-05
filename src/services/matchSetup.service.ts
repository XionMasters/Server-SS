import { Op } from 'sequelize';
import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import { DeckService } from './deck.service';

export class MatchSetupService {
  /**
   * Inicializa las cartas de una partida:
   * - Expande y baraja ambos decks
   * - Guarda deck_order y deck_index en Match
   * - Crea CardInPlay records (initialHandSize en mano, resto en deck)
   */
  static async initializeMatchCards(
    match: Match,
    player1DeckId: string,
    player2DeckId: string,
    initialHandSize: number = 7
  ): Promise<void> {
    try {
      console.log(`🎴 Inicializando cartas para partida ${match.id}...`);

      // Expandir y barajar ambos decks usando DeckService
      const shuffledDeck1 = await DeckService.expandAndShuffleDeckCardIds(player1DeckId);
      const shuffledDeck2 = await DeckService.expandAndShuffleDeckCardIds(player2DeckId);

      console.log(`   - Jugador 1: ${shuffledDeck1.length} cartas (expandidas por quantity y barajadas)`);
      console.log(`   - Jugador 2: ${shuffledDeck2.length} cartas (expandidas por quantity y barajadas)`);

      // Guardar orden de decks en Match
      match.player1_deck_order = JSON.stringify(shuffledDeck1);
      match.player2_deck_order = JSON.stringify(shuffledDeck2);
      match.player1_deck_index = initialHandSize;
      match.player2_deck_index = initialHandSize;
      await match.save();

      console.log(`✅ Decks barajados y guardados en Match`);

      // Cargar stats de CardKnight para todos los card_id únicos de ambos decks
      const allCardIds = [...new Set([...shuffledDeck1, ...shuffledDeck2])];
      const knightRows = await CardKnight.findAll({
        where: { card_id: { [Op.in]: allCardIds } }
      });
      const knightMap = new Map<string, CardKnight>();
      for (const k of knightRows) knightMap.set(k.card_id, k);

      // Helper local para obtener stats base de una carta
      const knightStats = (cardId: string) => {
        const k = knightMap.get(cardId);
        return {
          current_attack:  k?.attack  ?? 0,
          current_defense: k?.defense ?? 0,
          current_health:  k?.health  ?? 0,
          current_cosmos:  k?.cosmos  ?? 0,
        };
      };
      const cardsInPlayData: any[] = [];

      // Jugador 1 - cartas en mano
      for (let i = 0; i < initialHandSize && i < shuffledDeck1.length; i++) {
        cardsInPlayData.push({
          match_id: match.id,
          card_id: shuffledDeck1[i],
          player_number: 1,
          zone: 'hand',
          position: i,
          is_defensive_mode: false,
          ...knightStats(shuffledDeck1[i]),
          attached_cards: '[]',
          status_effects: '[]',
          can_attack_this_turn: true,
          has_attacked_this_turn: false,
        });
      }

      // Jugador 1 - resto en deck
      for (let i = initialHandSize; i < shuffledDeck1.length; i++) {
        cardsInPlayData.push({
          match_id: match.id,
          card_id: shuffledDeck1[i],
          player_number: 1,
          zone: 'deck',
          position: i - initialHandSize,
          is_defensive_mode: false,
          ...knightStats(shuffledDeck1[i]),
          attached_cards: '[]',
          status_effects: '[]',
          can_attack_this_turn: true,
          has_attacked_this_turn: false,
        });
      }

      // Jugador 2 - cartas en mano
      for (let i = 0; i < initialHandSize && i < shuffledDeck2.length; i++) {
        cardsInPlayData.push({
          match_id: match.id,
          card_id: shuffledDeck2[i],
          player_number: 2,
          zone: 'hand',
          position: i,
          is_defensive_mode: false,
          ...knightStats(shuffledDeck2[i]),
          attached_cards: '[]',
          status_effects: '[]',
          can_attack_this_turn: true,
          has_attacked_this_turn: false,
        });
      }

      // Jugador 2 - resto en deck
      for (let i = initialHandSize; i < shuffledDeck2.length; i++) {
        cardsInPlayData.push({
          match_id: match.id,
          card_id: shuffledDeck2[i],
          player_number: 2,
          zone: 'deck',
          position: i - initialHandSize,
          is_defensive_mode: false,
          ...knightStats(shuffledDeck2[i]),
          attached_cards: '[]',
          status_effects: '[]',
          can_attack_this_turn: true,
          has_attacked_this_turn: false,
        });
      }

      if (cardsInPlayData.length > 0) {
        await CardInPlay.bulkCreate(cardsInPlayData);
        console.log(
          `✅ ${cardsInPlayData.length} cartas creadas en CardInPlay (${initialHandSize * 2} en mano, resto en deck)`
        );
      }
    } catch (error) {
      console.error('❌ Error inicializando cartas:', error);
      throw error;
    }
  }
}
