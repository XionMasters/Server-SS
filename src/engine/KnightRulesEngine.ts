/**
 * KnightRulesEngine.ts
 *
 * Lógica pura para las acciones de caballero que modifican el GameState.
 *
 * Acciones cubiertas:
 * ✅ CHARGE_COSMOS  – Cargar Cosmo (+3 CP al jugador)
 * ✅ SACRIFICE_KNIGHT – Sacrificar Caballero (-1 vida al jugador)
 *    (el movimiento físico de la carta al yomotsu se hace en KnightManager)
 *
 * Acciones sin cambio en GameState puro:
 *    MOVE_KNIGHT – Solo cambia posición en CardInPlay (BD), gestionada en KnightManager
 *
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, resolveWinCondition } from './GameState';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';

export class KnightRulesEngine {
  // ══════════════════════════════════════════════════════════════════════════
  // CHARGE_COSMOS
  // ══════════════════════════════════════════════════════════════════════════

  /** Valida que el caballero puede cargar cosmo (turno correcto, fase activa). */
  static validateChargeKnightCosmos(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    if (state.current_player !== playerNumber) {
      return { valid: false, error: `No es turno del jugador ${playerNumber}` };
    }
    if (state.phase === 'game_over') {
      return { valid: false, error: 'La partida ya terminó' };
    }
    return { valid: true };
  }

  /**
   * Otorga cosmos_per_turn al jugador (según BASE_MATCH_RULES).
   * Acción: Cargar Cosmo (Carregar Cosmo).
   */
  static chargeKnightCosmos(
    state: GameState,
    playerNumber: 1 | 2
  ): { newState: GameState; cosmosGained: number } {
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const cosmosPerTurn = BASE_MATCH_RULES.turn.cosmos_per_turn;
    const cosmosGained = typeof cosmosPerTurn === 'function' ? cosmosPerTurn(state.current_turn) : cosmosPerTurn;
    player.cosmos += cosmosGained;

    newState.updated_at = Date.now();
    return { newState, cosmosGained };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SACRIFICE_KNIGHT
  // ══════════════════════════════════════════════════════════════════════════

  /** Valida que el sacrificio sea posible. */
  static validateSacrificeKnight(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    if (state.current_player !== playerNumber) {
      return { valid: false, error: `No es turno del jugador ${playerNumber}` };
    }
    if (state.phase === 'game_over') {
      return { valid: false, error: 'La partida ya terminó' };
    }
    return { valid: true };
  }

  /**
   * Aplica la penalidad de vida por sacrificio (-1 DLP).
   * El movimiento físico de la carta (field_knight → yomotsu) ocurre en KnightManager.
   */
  static sacrificeKnight(
    state: GameState,
    playerNumber: 1 | 2
  ): { newState: GameState; lifeLost: number } {
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const lifeLost = 1;
    player.life = Math.max(0, player.life - lifeLost);

    // Verificar si el sacrificio provoca derrota
    resolveWinCondition(newState);

    newState.updated_at = Date.now();
    return { newState, lifeLost };
  }
}
