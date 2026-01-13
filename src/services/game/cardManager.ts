// src/services/game/cardManager.ts
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
import Match from '../../models/Match';
import CardKnight from '../../models/CardKnight';
import sequelize from '../../config/database';
import { SlotValidation } from '../validation/slotValidation';

/**
 * CardManager - Gestiona cartas en juego
 * Responsabilidades:
 * - Jugar cartas
 * - Mover cartas
 * - Robar cartas iniciales
 * - Descartar cartas
 */

export class CardManager {
  /**
   * Juega una carta desde la mano al campo
   */
  static async playCard(
    match: any,
    cardInPlayId: string,
    playerNumber: number,
    position: number
  ): Promise<any> {
    const cardInPlay = await CardInPlay.findOne({
      where: { id: cardInPlayId, zone: 'hand', player_number: playerNumber },
      include: [{ model: Card, as: 'card', include: [{ model: CardKnight, as: 'card_knight' }] }]
    });

    if (!cardInPlay) {
      throw new Error('Carta no encontrada en la mano');
    }

    const card = (cardInPlay as any).card;
    if (!card) {
      throw new Error('Datos de carta no encontrados');
    }

    // Determinar zona destino según tipo de carta
    let targetZone: 'field_knight' | 'field_support' | 'field_helper' = 'field_support';
    if (card.type === 'caballero' || card.type === 'knight') {
      targetZone = 'field_knight';
    } else if (card.type === 'ayudante' || card.type === 'helper') {
      targetZone = 'field_helper';
    }

    // ✅ Validar que hay espacio en la zona destino
    SlotValidation.assertSlotAvailable(match.id, playerNumber, targetZone);

    // Mover carta al campo
    cardInPlay.zone = targetZone;
    cardInPlay.position = position || 0;
    await cardInPlay.save();

    // Consumir cosmos
    if (playerNumber === 1) {
      match.player1_cosmos -= card.cost;
    } else {
      match.player2_cosmos -= card.cost;
    }

    console.log(`🃏 Carta jugada: ${card.name} (${targetZone}) - Cosmos: -${card.cost}`);

    return cardInPlay;
  }

  /**
   * Roba las 5 cartas iniciales de cada jugador
   */
  static async drawInitialHands(matchId: string): Promise<void> {
    // Robar 5 cartas para player 1
    const p1DeckCards = await CardInPlay.findAll({
      where: { match_id: matchId, player_number: 1, zone: 'deck' },
      order: [sequelize.fn('RANDOM')],
      limit: 5
    });

    for (const card of p1DeckCards) {
      card.zone = 'hand';
      await card.save();
    }

    // Robar 5 cartas para player 2
    const p2DeckCards = await CardInPlay.findAll({
      where: { match_id: matchId, player_number: 2, zone: 'deck' },
      order: [sequelize.fn('RANDOM')],
      limit: 5
    });

    for (const card of p2DeckCards) {
      card.zone = 'hand';
      await card.save();
    }

    console.log(`🎲 Manos iniciales repartidas`);
  }

  /**
   * Crea todas las cartas en juego para ambos jugadores
   */
  static async createCardsInPlay(matchId: string, deck1Cards: any[], deck2Cards: any[]): Promise<void> {
    // Crear cartas para player 1
    for (const deckCard of deck1Cards) {
      const quantity = deckCard.quantity;
      for (let i = 0; i < quantity; i++) {
        const card = await Card.findByPk(deckCard.card_id, {
          include: [{ model: CardKnight, as: 'card_knight' }]
        });

        if (card) {
          const knight = (card as any).card_knight;
          await CardInPlay.create({
            match_id: matchId,
            card_id: card.id,
            player_number: 1,
            zone: 'deck',
            position: 0,
            current_attack: knight?.attack || 0,
            current_defense: knight?.defense || 0,
            current_health: knight?.health || 0,
            current_cosmos: knight?.cosmos || 0
          });
        }
      }
    }

    // Crear cartas para player 2
    for (const deckCard of deck2Cards) {
      const quantity = deckCard.quantity;
      for (let i = 0; i < quantity; i++) {
        const card = await Card.findByPk(deckCard.card_id, {
          include: [{ model: CardKnight, as: 'card_knight' }]
        });

        if (card) {
          const knight = (card as any).card_knight;
          await CardInPlay.create({
            match_id: matchId,
            card_id: card.id,
            player_number: 2,
            zone: 'deck',
            position: 0,
            current_attack: knight?.attack || 0,
            current_defense: knight?.defense || 0,
            current_health: knight?.health || 0,
            current_cosmos: knight?.cosmos || 0
          });
        }
      }
    }

    console.log(`🎴 Cartas en juego creadas (${deck1Cards.length + deck2Cards.length} cartas total)`);
  }
}
