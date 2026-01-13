import CardInPlay from '../../models/CardInPlay';

/**
 * 🎯 SLOT VALIDATION
 * Valida disponibilidad de slots en el campo de batalla
 */
export class SlotValidation {
  /**
   * Obtiene cantidad de cartas en una zona específica
   */
  static async getCardCountInZone(
    matchId: string,
    playerNumber: number,
    zone: string
  ): Promise<number> {
    const count = await CardInPlay.count({
      where: {
        match_id: matchId,
        player_number: playerNumber,
        zone: zone
      }
    });
    return count;
  }

  /**
   * Valida que haya espacio disponible en la zona destino
   * - field_knight: máximo 5
   * - field_support: máximo 5
   * - field_helper: máximo 1
   */
  static async assertSlotAvailable(
    matchId: string,
    playerNumber: number,
    targetZone: string
  ): Promise<void> {
    const maxSlots: { [key: string]: number } = {
      field_knight: 5,
      field_support: 5,
      field_helper: 1
    };

    const maxAllowed = maxSlots[targetZone];
    if (!maxAllowed) {
      throw new Error(`Zona inválida: ${targetZone}`);
    }

    const currentCount = await this.getCardCountInZone(
      matchId,
      playerNumber,
      targetZone
    );

    if (currentCount >= maxAllowed) {
      const zoneNames: { [key: string]: string } = {
        field_knight: 'caballeros',
        field_support: 'técnicas',
        field_helper: 'ayudante'
      };

      throw new Error(
        `No hay espacio en ${zoneNames[targetZone]}. Máximo: ${maxAllowed}`
      );
    }
  }

  /**
   * Obtiene todos los caballeros activos del jugador
   */
  static async getActiveKnights(
    matchId: string,
    playerNumber: number
  ): Promise<CardInPlay[]> {
    const knights = await CardInPlay.findAll({
      where: {
        match_id: matchId,
        player_number: playerNumber,
        zone: 'field_knight'
      },
      include: [
        {
          model: require('../../models/Card').default as any,
          as: 'card',
          include: [
            {
              model: require('../../models/CardKnight').default as any,
              as: 'card_knight'
            }
          ]
        }
      ]
    });

    return knights;
  }

  /**
   * Valida que el caballero pueda atacar
   * - Debe estar en field_knight
   * - Debe estar apto (can_attack_this_turn = true)
   * - Debe tener ataque > 0
   */
  static async assertCanAttack(
    cardInPlay: CardInPlay,
    playerNumber: number
  ): Promise<void> {
    if (cardInPlay.player_number !== playerNumber) {
      throw new Error('No puedes atacar con el caballero del oponente');
    }

    if (cardInPlay.zone !== 'field_knight') {
      throw new Error('Solo los caballeros en el campo pueden atacar');
    }

    if (!cardInPlay.can_attack_this_turn) {
      throw new Error('Este caballero no puede atacar este turno');
    }

    const card = (cardInPlay as any).card;
    const knight = (card as any).card_knight;

    if (!knight || knight.attack <= 0) {
      throw new Error('Este caballero no tiene ataque');
    }
  }

  /**
   * Valida que el defensor sea un caballero válido del oponente
   */
  static async assertValidDefender(
    defenderCardInPlay: CardInPlay,
    opponentNumber: number
  ): Promise<void> {
    if (defenderCardInPlay.player_number !== opponentNumber) {
      throw new Error('El defensor debe ser del oponente');
    }

    if (defenderCardInPlay.zone !== 'field_knight') {
      throw new Error('Solo se puede atacar a caballeros en el campo');
    }
  }
}
