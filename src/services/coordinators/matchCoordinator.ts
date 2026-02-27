/**
 * MatchCoordinator.ts
 * 
 * Coordinador para operaciones EN un match activo.
 * 
 * Responsabilidades:
 * ✅ Obtener Match UNA SOLA VEZ
 * ✅ Extraer playerNumber del usuario
 * ✅ Validaciones CONTEXTUALES (¿eres jugador?, ¿match activo?)
 * ✅ Delegar a Manager especializado
 * 
 * ❌ NO valida reglas de juego (eso es GameRulesEngine)
 * ❌ NO ejecuta operaciones complejas
 * ❌ NO hace queries múltiples
 * 
 * Patrón: Thin Coordinator que actúa como traductor
 * entre mundo HTTP (matchId, userId) y mundo de lógica (match, playerNumber)
 */

import  Match  from '../../models/Match';
import { TurnManager } from '../game/turnManager';
import { CardManager } from '../game/cardManager';
import { AttackManager } from '../game/attackManager';
import { KnightManager } from '../game/knightManager';

export class MatchCoordinator {

  /**
   * Fin de turno
   * DELEGA: Lógica de turno a TurnManager
   * 
   * Flujo:
   * 1. Obtener Match (1 búsqueda)
   * 2. Validar contexto (¿eres jugador?)
   * 3. Delegar a TurnManager
   */
  static async endTurn(matchId: string, userId: string, actionId: string) {
    // 1️⃣ Obtener Match
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { success: false, error: 'Match no encontrado' };
    }

    // 2️⃣ Extraer playerNumber
    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) {
      return { success: false, error: 'No eres jugador de este match' };
    }

    // 3️⃣ Validar contexto (¿match activo?)
    if (match.phase === 'finished') {
      return { success: false, error: 'Match no está activo' };
    }

    // 4️⃣ Delegar a TurnManager (que hace validaciones de reglas + persistencia)
    return await TurnManager.endTurn(match, playerNumber, actionId);
  }

  /**
   * Juega una carta
   * DELEGA: Lógica de cartas a CardManager
   */
  static async playCard(
    matchId: string,
    userId: string,
    cardId: string,
    zone: string,
    position: number,
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { success: false, error: 'Match no encontrado' };
    }

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) {
      return { success: false, error: 'No eres jugador de este match' };
    }

    if (match.phase === 'finished') {
      return { success: false, error: 'Match no está activo' };
    }

    return await CardManager.playCard(match, playerNumber, cardId, zone, position, actionId);
  }

  /**
   * Ataca con una carta
   * DELEGA: Lógica de combate a AttackManager
   */
  static async attack(
    matchId: string,
    userId: string,
    attackerId: string,
    defenderId: string,
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { success: false, error: 'Match no encontrado' };
    }

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) {
      return { success: false, error: 'No eres jugador de este match' };
    }

    if (match.phase === 'finished') {
      return { success: false, error: 'Match no está activo' };
    }

    return await AttackManager.attack(match, playerNumber, attackerId, defenderId, actionId);
  }

  /**
   * Cambia modo defensivo de una carta
   * DELEGA: Cambio de modo a CardManager
   */
  static async changeDefensiveMode(
    matchId: string,
    userId: string,
    cardId: string,
    mode: 'normal' | 'defense' | 'evasion',
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { success: false, error: 'Match no encontrado' };
    }

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) {
      return { success: false, error: 'No eres jugador de este match' };
    }

    if (match.phase === 'finished') {
      return { success: false, error: 'Match no está activo' };
    }

      return await AttackManager.changeDefensiveMode(match, playerNumber, cardId, mode, actionId);
  }

  /**
   * Cargar Cosmo: otorga cosmos_per_turn CP al jugador activo.
   * DELEGA: KnightManager
   */
  static async chargeKnightCosmos(
    matchId: string,
    userId: string,
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador de este match' };

    if (match.phase === 'finished') return { success: false, error: 'Match no está activo' };

    return await KnightManager.chargeKnightCosmos(match, playerNumber, actionId);
  }

  /**
   * Sacrificar Caballero: -1 vida y mueve la carta al yomotsu.
   * DELEGA: KnightManager
   */
  static async sacrificeKnight(
    matchId: string,
    userId: string,
    cardInPlayId: string,
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador de este match' };

    if (match.phase === 'finished') return { success: false, error: 'Match no está activo' };

    return await KnightManager.sacrificeKnight(match, playerNumber, cardInPlayId, actionId);
  }

  /**
   * Mover Caballero: cambia de posición en el campo (0–4).
   * DELEGA: KnightManager
   */
  static async moveKnight(
    matchId: string,
    userId: string,
    cardInPlayId: string,
    targetPosition: number,
    actionId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };

    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador de este match' };

    if (match.phase === 'finished') return { success: false, error: 'Match no está activo' };

    return await KnightManager.moveKnight(match, playerNumber, cardInPlayId, targetPosition, actionId);
  }

  /**
   * HELPER: Obtiene número de jugador
   * (búsqueda simple, NO es validación compleja)
   * 
   * Caso especial TEST: player1_id === player2_id → usar current_player
   */
  private static _getPlayerNumber(match: Match, userId: string): 1 | 2 | null {
    const isTestMatch = match.player1_id === match.player2_id;
    if (isTestMatch && match.player1_id === userId) {
      return match.current_player as 1 | 2;
    }
    if (match.player1_id === userId) return 1;
    if (match.player2_id === userId) return 2;
    return null;
  }
}
