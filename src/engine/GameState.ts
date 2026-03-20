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

// ─── Zona origen para selecciones interactivas ─────────────────────────────
export type ZoneSelectSource = 'yomotsu' | 'deck' | 'hand' | 'field_knight' | 'field_technique';

// ─── Zona destino para envío de cartas ──────────────────────────────────────
export type ZoneDestination = 'hand' | 'field' | 'cositos';

export interface SelectionFilter {
  /** Filtrar por tipo de carta (knight, technique, object, etc.). */
  type?: string;
  /** Solo mostrar las primeras N cartas del mazo (top N para deck search). */
  top_n?: number;
}

/**
 * Estado de selección interactiva pendiente.
 * Se almacena en GameState.pending_selection y en Match.pending_selection (JSONB).
 *
 * Flujo:
 *   1. Habilidad ejecuta `request_selection` → se crea este objeto.
 *   2. Estado se persiste. Ambos jugadores reciben el estado con pending_selection.
 *   3. El jugador indicado envía `resolve_selection` con el instance_id elegido.
 *   4. El motor ejecuta `on_select` con selectedCardId = chosen_card_id.
 *   5. pending_selection se limpia.
 */
export interface PendingSelection {
  /** ID único para correlacionar la respuesta del cliente. */
  id: string;
  /** Jugador que debe seleccionar. */
  player_number: 1 | 2;
  /** Zona de donde provienen las opciones. */
  zone: ZoneSelectSource;
  /** Filtros para limitar qué cartas puede elegir el jugador. */
  filter?: SelectionFilter;
  /** Destino de la carta elegida. */
  destination: ZoneDestination;
  /**
   * Acciones a ejecutar una vez que el jugador elige.
   * Usan el target especial `'selected'` para referirse a la carta elegida.
   */
  on_select: any[];
  /** Instancia de la carta que generó esta selección. */
  source_card_id: string;
  /** Jugador que jugó la carta que generó la selección. */
  source_player: 1 | 2;
  /** Timestamp de creación. */
  created_at: number;
  /**
   * IDs de instancias visibles para el jugador (relleno por el servicio para deck search).
   * Si es undefined, el cliente muestra la zona completa sin filtro.
   */
  visible_card_ids?: string[];
}

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
  /**
   * Lista completa de caballeros en el Yomotsu.
   * Ambos jugadores pueden verla (regla estándar de juegos de cartas).
   * graveyard_count = graveyard.length (derivado, mantenido por compatibilidad).
   */
  graveyard: CardInGameState[];
  graveyard_count: number; // deprecated: derivar de graveyard.length
  costos_count: number; // "Cositos" - pile de eliminados permanentes
  /**
   * Cartas fuera del campo con habilidades pasivas reactivas.
   * Solo las que tienen un trigger distinto de CARD_PLAYED/ACTIVE.
   * Subset de graveyard (yomotsu) + deck cards con pasivas.
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

  /**
   * Selección interactiva pendiente. null si no hay ninguna.
   * Cuando está seteada, el motor detiene la cadena de acciones y espera
   * que el jugador indicado envíe `resolve_selection`.
   */
  pending_selection: PendingSelection | null;

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
      graveyard: [],
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
      graveyard: [],
      graveyard_count: 0,
      costos_count: 0,
      passive_watchers: [],
    },
    scenario: null,
    winner_id: null,
    rng_seed: 0,
    pending_selection: null,
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
