import CardInPlay from '../../models/CardInPlay';

export class AttackValidation {
  static assertValidAttacker(
    attackerCardInPlay: CardInPlay | null,
    playerNumber: number,
    userId: string
  ): void {
    if (!attackerCardInPlay) {
      throw new Error('Caballero atacante no encontrado');
    }
    if (attackerCardInPlay.player_number !== playerNumber) {
      throw new Error('No puedes atacar con cartas del oponente');
    }
    if (attackerCardInPlay.zone !== 'field_knight') {
      throw new Error('Solo los caballeros en el campo pueden atacar');
    }
  }

  static assertCanAttackThisTurn(attackerCardInPlay: CardInPlay): void {
    if (!attackerCardInPlay.can_attack_this_turn) {
      throw new Error('Este caballero no puede atacar este turno');
    }
    if (attackerCardInPlay.has_attacked_this_turn) {
      throw new Error('Este caballero ya atacó este turno');
    }
  }

  static assertValidDefender(
    defenderCardInPlay: CardInPlay | null,
    opponentNumber: number
  ): void {
    if (!defenderCardInPlay) {
      throw new Error('Caballero defensor no encontrado');
    }
    if (defenderCardInPlay.player_number !== opponentNumber) {
      throw new Error('El defensor debe ser del oponente');
    }
    if (defenderCardInPlay.zone !== 'field_knight') {
      throw new Error('Solo se puede atacar a caballeros en el campo');
    }
  }

  static assertHasAttackPower(cardInPlay: CardInPlay): void {
    const card = (cardInPlay as any).card;
    if (!card) {
      throw new Error('Datos de carta no encontrados');
    }
    const knight = (card as any).card_knight;
    if (!knight || knight.attack === undefined || knight.attack <= 0) {
      throw new Error('Este caballero no tiene poder de ataque');
    }
  }

  static assertHasDefensePower(cardInPlay: CardInPlay): void {
    const card = (cardInPlay as any).card;
    if (!card) {
      throw new Error('Datos de carta no encontrados');
    }
    const knight = (card as any).card_knight;
    if (!knight) {
      throw new Error('Este caballero no tiene datos de defensa');
    }
    if (knight.defense === undefined) {
      throw new Error('Valores de defensa inválidos');
    }
  }

  static assertValidDefensiveMode(mode: string): void {
    const validModes = ['normal', 'defense', 'evasion'];
    if (!validModes.includes(mode)) {
      throw new Error('Modo inválido: ' + mode + '. Modos válidos: ' + validModes.join(', '));
    }
  }
}
