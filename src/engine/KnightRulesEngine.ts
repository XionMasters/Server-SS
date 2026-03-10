/**
 * KnightRulesEngine.ts
 *
 * Lógica pura para las acciones de caballero que modifican el GameState.
 *
 * Acciones cubiertas:
 * ✅ CHARGE_COSMOS    – Cargar Cosmo (+cosmos_per_charge CP al jugador)
 * ✅ SACRIFICE_KNIGHT – Sacrificar Caballero (-1 vida al jugador)
 *    (el movimiento físico de la carta al yomotsu se hace en KnightManager)
 *
 * Acciones sin cambio en GameState puro:
 *    MOVE_KNIGHT – Solo cambia posición en CardInPlay (BD), gestionada en KnightManager
 *
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, Player, resolveWinCondition } from './GameState';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';
import { AbilityEngine } from './abilities/AbilityEngine';
import type { AbilityDefinition } from './abilities/AbilityDefinition';
import type { GameEvent } from './events/GameEvents';

// Las habilidades activas ahora viven como AbilityDefinition en card_abilities.effects (JSONB).
// Ver AbilityEngine para la lógica de ejecución. No hay handlers por carta aquí.

// ─── Clone helpers ────────────────────────────────────────────────────────────
//
// Usamos clones selectivos en lugar de structuredClone cuando solo mutamos campos
// de nivel Player (cosmos, life). Mucho más rápido en estados grandes.
// Para mutaciones de cartas individuales, el caller debe clonar la carta afectada.

function clonePlayer(player: Player): Player {
  return {
    ...player,
    hand:             [...player.hand],
    field_knights:    [...player.field_knights],
    field_techniques: [...player.field_techniques],
  };
}

/** Clon superficial del GameState con jugadores frescos. Suficiente para mutaciones de Player. */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    player1: clonePlayer(state.player1),
    player2: clonePlayer(state.player2),
  };
}

// ─── Validation result ────────────────────────────────────────────────────────

type ValidationResult = { valid: boolean; error?: string };

export class KnightRulesEngine {
  // ══════════════════════════════════════════════════════════════════════════
  // COMMON GUARDS
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida que sea el turno del jugador y la partida no haya terminado.
   * Reutilizado por todos los métodos de validación.
   */
  static validateTurn(state: GameState, playerNumber: 1 | 2): ValidationResult {
    if (state.current_player !== playerNumber)
      return { valid: false, error: `No es turno del jugador ${playerNumber}` };
    if (state.phase === 'game_over')
      return { valid: false, error: 'La partida ya terminó' };
    return { valid: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHARGE_COSMOS
  // ══════════════════════════════════════════════════════════════════════════

  static validateChargeKnightCosmos(
    state: GameState,
    playerNumber: 1 | 2,
  ): ValidationResult {
    return this.validateTurn(state, playerNumber);
  }

  /**
   * Otorga cosmos_per_charge al jugador (según BASE_MATCH_RULES).
   * Acción: Cargar Cosmo (Carregar Cosmo).
   */
  static chargeKnightCosmos(
    state: GameState,
    playerNumber: 1 | 2,
  ): { newState: GameState; cosmosGained: number } {
    const newState = cloneState(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const cosmosGained = this.simulateChargeKnightCosmos(state);
    player.cosmos += cosmosGained;

    newState.updated_at = Date.now();
    return { newState, cosmosGained };
  }

  /**
   * Calcula cuánto cosmo se ganaría al cargar, sin mutar el estado.
   * Útil para IA/simulación y para mostrar el valor al cliente antes de confirmar.
   */
  static simulateChargeKnightCosmos(state: GameState): number {
    const cosmosPerCharge = BASE_MATCH_RULES.turn.cosmos_per_charge;
    return Math.max(
      0,
      typeof cosmosPerCharge === 'function'
        ? (cosmosPerCharge(state.current_turn) ?? 0)
        : (cosmosPerCharge ?? 0),
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SACRIFICE_KNIGHT
  // ══════════════════════════════════════════════════════════════════════════

  static validateSacrificeKnight(
    state: GameState,
    playerNumber: 1 | 2,
  ): ValidationResult {
    return this.validateTurn(state, playerNumber);
  }

  /**
   * Aplica la penalidad de vida por sacrificio (-1 DLP).
   * El movimiento físico de la carta (field_knight → yomotsu) ocurre en KnightManager.
   */
  static sacrificeKnight(
    state: GameState,
    playerNumber: 1 | 2,
  ): { newState: GameState; lifeLost: number } {
    const newState = cloneState(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const lifeLost = 1;
    player.life = Math.max(0, (player.life ?? 0) - lifeLost);

    resolveWinCondition(newState);

    newState.updated_at = Date.now();
    return { newState, lifeLost };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USE_ABILITY  (habilidades activas de cartas)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida si la habilidad puede activarse (turno, fase, carta en campo, costos, condiciones).
   * La definición completa de la habilidad proviene del JSONB de la BD.
   */
  static validateUseAbility(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    abilityDef: AbilityDefinition,
    event: GameEvent,
  ): ValidationResult {
    const turnCheck = this.validateTurn(state, playerNumber);
    if (!turnCheck.valid) return turnCheck;

    const player = playerNumber === 1 ? state.player1 : state.player2;
    if (!player.field_knights.some(c => c.instance_id === cardId))
      return { valid: false, error: 'Caballero no encontrado en campo' };

    return AbilityEngine.canActivate(abilityDef, state, playerNumber, cardId, event);
  }

  /**
   * Ejecuta una habilidad activa de caballero.
   * La definición declarativa proviene del JSONB en card_abilities.effects.
   *
   * @returns newState    — estado inmutable actualizado
   *          affectedIds — instance_ids de todas las cartas cuyo estado cambió (el caster siempre incluido)
   *          extras      — datos adicionales para el cliente (coin_flip_result, etc.)
   */
  static useAbility(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    abilityDef: AbilityDefinition,
    event: GameEvent,
  ): { newState: GameState; affectedIds: string[]; extras?: Record<string, any> } {
    const result = AbilityEngine.execute(abilityDef, state, playerNumber, cardId, event);
    // Garantizar que el caster siempre figure en affectedIds aunque la habilidad
    // no lo modifique directamente (ej: coin flip que falla).
    const affectedIds = Array.from(new Set([cardId, ...result.affectedIds]));
    return { ...result, affectedIds };
  }
}

