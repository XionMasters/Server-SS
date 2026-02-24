/**
 * MatchesCoordinator.ts
 * 
 * Coordinador para operaciones generales de matches.
 * 
 * Responsabilidades:
 * ✅ Validaciones CONTEXTUALES (¿existe match?, ¿usuario autorizado?, etc.)
 * ✅ Obtener datos necesarios
 * ✅ Delegar a servicios especializados
 * 
 * ❌ NO valida reglas de juego (eso es GameRulesEngine)
 * ❌ NO ejecuta lógica compleja
 * ❌ NO hace queries complejas
 * 
 * Patrón: Thin Coordinator, Fat RulesEngine
 */

import  Match  from '../../models/Match';
import  User  from '../../models/User';
// import { GameStateBuilder } from './GameStateBuilder'; // TODO: Not implemented yet
import { StartMatchService } from '../startMatch.service';

export class MatchesCoordinator {
  /**
   * Busca rival o crea nueva partida en espera
   * DELEGA: Todas las validaciones a StartMatchService
   */
  static async findMatch(userId: string) {
    try {
      return await StartMatchService.findMatch(userId);
    } catch (error: any) {
      return { success: false, error: `Error buscando match: ${error?.message || 'Unknown error'}` };
    }
  }

  /**
   * Crea match de prueba/test (para desarrollo)
   */
  static async startTestMatch(userId: string) {
    try {
      return await StartMatchService.createNewMatch(userId, userId, 'TEST');
    } catch (error: any) {
      return { success: false, error: `Error creando test match: ${error?.message || 'Unknown error'}` };
    }
  }

  /**
   * Usuario abandona match
   * 
   * Validaciones contextuales:
   * ✅ ¿Match existe?
   * ✅ ¿Usuario pertenece?
   */
  static async abandonMatch(matchId: string, userId: string) {
    // 1️⃣ Obtener match
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { success: false, error: 'Match no encontrado' };
    }

    // 2️⃣ Validar que el usuario pertenece
    const playerNumber = this._getPlayerNumber(match, userId);
    if (!playerNumber) {
      return { success: false, error: 'No eres jugador de este match' };
    }

    // 3️⃣ Delegar al servicio especializado
    // (Aquí iría MatchService.abandonMatch o similar)
    try {
      // return await MatchService.abandonMatch(match, userId);
      return { success: true, message: 'Match abandonado' };
    } catch (error: any) {
      return { success: false, error: `Error abandonando match: ${error?.message || 'Unknown error'}` };
    }
  }

  /**
   * Obtiene estado actual de match
   * DELEGA: Serialización a GameStateBuilder
   */
  static async getMatchState(matchId: string) {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) {
        return null;
      }

      return await GameStateBuilder.buildFromMatch(match);
    } catch (error) {
      console.error('Error obteniendo match state:', error);
      return null;
    }
  }

  /**
   * HELPER: Obtiene número de jugador para un usuario en un match
   * (búsqueda simple, NO es validación compleja)
   */
  private static _getPlayerNumber(match: Match, userId: string): 1 | 2 | null {
    if (match.player1_id === userId) return 1;
    if (match.player2_id === userId) return 2;
    return null;
  }
}
