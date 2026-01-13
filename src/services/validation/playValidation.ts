// src/services/validation/playValidation.ts
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';

/**
 * PlayValidation - Valida si una carta puede ser jugada
 */

export class PlayValidation {
  /**
   * Valida que la carta exista en la mano del jugador
   */
  static async assertCardInHand(
    matchId: string,
    playerId: string,
    cardInPlayId: string,
    playerNumber: number
  ): Promise<CardInPlay> {
    const cardInPlay = await CardInPlay.findOne({
      where: {
        id: cardInPlayId,
        match_id: matchId,
        player_number: playerNumber,
        zone: 'hand'
      },
      include: [{ model: Card, as: 'card' }]
    });

    if (!cardInPlay) {
      throw new Error('Carta no encontrada en la mano');
    }

    return cardInPlay;
  }

  /**
   * Valida que el tipo de carta sea válido
   */
  static assertValidCardType(card: any): void {
    const validTypes = ['knight', 'caballero', 'technique', 'tecnica', 'item', 'stage', 'helper', 'ayudante', 'event'];

    if (!validTypes.includes(card.type)) {
      throw new Error(`Tipo de carta no válido: ${card.type}`);
    }
  }
}
