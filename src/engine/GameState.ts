/**
 * GameState.ts
 * 
 * Modelo puro de estado del juego.
 * NO tiene métodos, NO toca BD, solo datos.
 * Este es el contrato que recibe/retorna TurnRulesEngine y otros engines puros.
 * 
 * ✅ Determinístico - Misma entrada siempre = mismo resultado
 * ✅ Serializable - Puede ser JSON stringify/parse
 * ✅ Inmutable - Las mutaciones retornan nuevo estado
 */

export interface Player {
  id: string;
  number: 1 | 2;
  life: number;
  cosmos: number;
  hand: CardInGameState[];
  field_knights: CardInGameState[];
  field_techniques: CardInGameState[];
  field_helper: CardInGameState | null;
  field_occasion: CardInGameState | null;
  deck_count: number;
  graveyard_count: number;
  costos_count: number; // "Cositos" - pie de página
  /**
   * Cartas fuera del campo (yomotsu, mazo, etc.) con habilidades pasivas reactivas.
   * Solo se incluyen las que tienen al menos un trigger distinto de CARD_PLAYED/ACTIVE.
   * Permiten que Ikki reaccione desde el yomotsu, Shun desde el mazo, etc.
   */
  passive_watchers: CardInGameState[];
}

// Re-exportar desde StatusEffects.ts para compatibilidad con importaciones existentes
export { StatusEffectType, StatusEffect, MODE_EFFECT_TYPES, deriveModeFromEffects, computeCeBonus, computeArBonus, parseStatusEffects, tickStatusEffects, setModeEffect } from './StatusEffects';
import { StatusEffect } from './StatusEffects';
import type { RawAbility } from './abilities/AbilityDefinition';

// ─────────────────────────────────────────────────────
// CARTA EN PARTIDA
// ─────────────────────────────────────────────────────

export interface CardInGameState {
  instance_id: string;
  card_id: string;
  card_type: string; // 'knight', 'technique', 'item', etc.
  player_number: 1 | 2;
  zone: string; // 'hand', 'field_knight', 'field_technique', etc.
  position: number;

  /** Modo de combate DERIVADO de status_effects. No se persiste directamente. */
  mode: 'normal' | 'defense' | 'evasion' | 'prayer';

  is_exhausted: boolean;
  attacked_this_turn: boolean;

  /** Efectos de estado activos. Source of truth para mode y boosts. */
  status_effects: StatusEffect[];

  /**
   * Código estable de la carta base (ej: 'ikki_phoenix', 'shun_andromeda').
   * Permite condiciones que matchean cartas específicas sin importar la instancia.
   */
  card_code: string;

  /**
   * Habilidades de la carta pre-parseadas, listas para PassiveTriggerEngine.
   * Vacío si la carta no tiene habilidades o no se cargaron las relaciones.
   */
  raw_abilities: RawAbility[];

  // Stats de combate — base + boosts, calculados al mapear desde BD
  ce: number;   // Combat Effectiveness (base + ce_boost activos)
  ar: number;   // Armor Rating (base + ar_boost activos)
  current_health: number;
  current_cosmos: number; // CP actuales de la carta (se usa para habilidades que cuestan CP)

  /** Stats base, sin boosts. Necesarios para recomputar al expirar efectos. */
  base_ce: number;
  base_ar: number;
}

export interface GameScenario {
  instance_id: string;
  card_id: string;
  card_name: string;
  effect: string;
}

export interface GameState {
  // Identificadores
  match_id: string;
  
  // Turno y fase
  current_turn: number; // 1, 2, 3, ...
  current_player: 1 | 2; // Quién juega ahora
  phase: 'player1_turn' | 'player2_turn' | 'game_over';
  
  // Jugadores
  player1: Player;
  player2: Player;
  
  // Tablero compartido
  scenario: GameScenario | null;
  
  // Ganador (null si partida en curso)
  winner_id: string | null;

  // Semilla del RNG determinista (avanza con cada acción aleatoria)
  rng_seed: number;

  // Metadata
  created_at: number; // timestamp
  updated_at: number; // timestamp
}

/**
 * Factory: crear GameState vacío para testing/simulación
 */
export function createEmptyGameState(matchId: string): GameState {
  return {
    match_id: matchId,
    current_turn: 1,
    current_player: 1,
    phase: 'player1_turn',
    player1: {
      id: 'player1',
      number: 1,
      life: 12,
      cosmos: 0,
      hand: [],
      field_knights: [],
      field_techniques: [],
      field_helper: null,
      field_occasion: null,
      deck_count: 40,
      graveyard_count: 0,
      costos_count: 0,
      passive_watchers: [],
    },
    player2: {
      id: 'player2',
      number: 2,
      life: 12,
      cosmos: 0,
      hand: [],
      field_knights: [],
      field_techniques: [],
      field_helper: null,
      field_occasion: null,
      deck_count: 40,
      graveyard_count: 0,
      costos_count: 0,
      passive_watchers: [],
    },
    scenario: null,
    winner_id: null,
    rng_seed: 0,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

/**
 * Verifica la condición de victoria: si algún jugador tiene vida <= 0,
 * establece phase='game_over' y winner_id en el estado.
 *
 * Debe llamarse después de cualquier operación que pueda reducir la vida
 * de un jugador (ataque, sacrificio, etc.).
 *
 * IMPORTANTE: Muta `state` directamente. Llámalo sobre un structuredClone.
 */
export function resolveWinCondition(state: GameState): void {
  if (state.phase === 'game_over') return; // ya decidido

  if (state.player1.life <= 0) {
    state.player1.life = 0;
    state.phase = 'game_over';
    state.winner_id = state.player2.id;
  } else if (state.player2.life <= 0) {
    state.player2.life = 0;
    state.phase = 'game_over';
    state.winner_id = state.player1.id;
  }
}

/**
 * Validación básica de GameState
 */
export function validateGameState(state: GameState): { valid: boolean; error?: string } {
  if (!state.match_id) return { valid: false, error: 'match_id requerido' };
  if (state.current_turn < 1) return { valid: false, error: 'current_turn debe ser >= 1' };
  if (![1, 2].includes(state.current_player)) return { valid: false, error: 'current_player debe ser 1 o 2' };
  if (!state.player1 || !state.player2) return { valid: false, error: 'Ambos jugadores requeridos' };
  if (state.player1.life < 0) return { valid: false, error: 'player1.life no puede ser negativo' };
  if (state.player2.life < 0) return { valid: false, error: 'player2.life no puede ser negativo' };
  return { valid: true };
}
