// src/services/validation/turnValidation.ts
/**
 * TurnValidation - Valida turno y estado del match
 */

export class TurnValidation {
  /**
   * Valida que sea el turno del jugador
   */
  static assertIsPlayerTurn(match: any, playerNumber: number, isTestMatch: boolean = false): void {
    // En TEST match, cualquiera puede jugar
    if (isTestMatch) {
      return;
    }

    if (match.current_player !== playerNumber) {
      throw new Error(`No es tu turno. Es turno del player ${match.current_player}`);
    }
  }

  /**
   * Valida que el match exista y esté activo
   */
  static assertMatchActive(match: any): void {
    if (!match) {
      throw new Error('Partida no encontrada');
    }

    if (!['player1_turn', 'player2_turn', 'starting'].includes(match.phase)) {
      throw new Error(`Match no activa. Estado: ${match.phase}`);
    }
  }

  /**
   * Valida que el jugador sea parte del match
   */
  static assertPlayerInMatch(match: any, userId: string): number {
    if (match.player1_id === userId) {
      return 1;
    } else if (match.player2_id === userId) {
      return 2;
    } else {
      throw new Error('No eres parte de esta partida');
    }
  }

  /**
   * Detecta si es una partida TEST
   */
  static isTestMatch(match: any): boolean {
    return match.player1_id === match.player2_id;
  }
}
