import CardInPlay from '../../models/CardInPlay';

export class CardDrawService {
  /**
   * Roba la carta superior del mazo del jugador y la mueve a su mano.
   * 
   * @param match_id ID de la partida
   * @param playerNumber Jugador que roba (1 o 2)
   * @param transaction Transacción activa de Sequelize
   * @returns La carta robada, o null si el mazo está vacío
   */
  static async drawCard(
    match_id: string,
    playerNumber: 1 | 2,
    transaction: any
  ): Promise<typeof CardInPlay.prototype | null> {
    // Buscar la primera carta del mazo del jugador
    const topCard = await CardInPlay.findOne({
      where: { match_id, player_number: playerNumber, zone: 'deck' },
      order: [['position', 'ASC']],
      transaction,
    });

    if (!topCard) {
      console.log(`[CardDrawService] Jugador ${playerNumber} no tiene cartas en el mazo`);
      return null;
    }

    // Moverla al final de la mano
    const handCount = await CardInPlay.count({
      where: { match_id, player_number: playerNumber, zone: 'hand' },
      transaction,
    });

    topCard.zone = 'hand';
    topCard.position = handCount;
    await topCard.save({ transaction });

    console.log(`[CardDrawService] Jugador ${playerNumber} robó carta ${topCard.id} (posición mano: ${handCount})`);
    return topCard;
  }
}