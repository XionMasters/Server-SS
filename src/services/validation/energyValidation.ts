// src/services/validation/energyValidation.ts
/**
 * EnergyValidation - Valida cosmos/energía
 */

export class EnergyValidation {
  /**
   * Valida que el jugador tenga suficiente cosmos
   */
  static assertEnoughCosmos(currentCosmos: number, requiredCosmos: number): void {
    if (currentCosmos < requiredCosmos) {
      throw new Error(
        `No tienes suficiente cosmos. Tienes: ${currentCosmos}, Necesitas: ${requiredCosmos}`
      );
    }
  }

  /**
   * Obtiene el cosmos actual del jugador
   */
  static getCurrentCosmos(match: any, playerNumber: number): number {
    return playerNumber === 1 ? match.player1_cosmos : match.player2_cosmos;
  }

  /**
   * Detrae cosmos del jugador
   */
  static consumeCosmos(match: any, playerNumber: number, amount: number): void {
    if (playerNumber === 1) {
      match.player1_cosmos -= amount;
    } else {
      match.player2_cosmos -= amount;
    }
  }
}
