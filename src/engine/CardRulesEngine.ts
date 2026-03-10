/**
 * CardRulesEngine.ts
 *
 * Lógica pura para operaciones con cartas.
 *
 * Responsabilidades:
 * ✅ Validar juego de cartas (desde mano a campo)
 * ✅ Calcular costo/generate de cosmos
 * ✅ Validar restricciones de zona y posición
 * ✅ Ejecutar cambios sin mutación (clone selectivo)
 *
 * Convención de zonas: usa notación BD ('field_support', no 'field_technique').
 * La traducción cliente ↔ BD vive en ZoneMapper.
 *
 * 100% puro: sin await, sin BD, sin side effects.
 */

import { GameState, Player, CardInGameState } from './GameState';
import { ZoneMapper } from '../utils/ZoneMapper';

// ─── Clone helpers ─────────────────────────────────────────────────────────────
// Selectivos: más baratos que structuredClone para mutaciones de player-level.

function clonePlayer(player: Player): Player {
  return {
    ...player,
    hand:             [...player.hand],
    field_knights:    [...player.field_knights],
    field_techniques: [...player.field_techniques],
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    player1: clonePlayer(state.player1),
    player2: clonePlayer(state.player2),
  };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

type ValidationResult = { valid: boolean; error?: string };

/**
 * Datos de carta que el motor necesita pero que viven en la BD (no en GameState).
 * El manager los lee una sola vez y los pasa aquí.
 */
export interface CardBdStats {
  cost: number;
  generate: number;
  card_type: string;  // 'knight', 'technique', …
  health?: number;
  attack?: number;
  defense?: number;
  cosmos?: number;
}

export class CardRulesEngine {
  // ══════════════════════════════════════════════════════════════════════════
  // VALIDATE PLAY CARD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Valida que una carta pueda ser jugada.
   *
   * NOTA: La verificación "carta está en mano" NO se hace aquí porque
   * MatchStateMapper aún no puebla player.hand desde cards_in_play.
   * CardManager.playCard ya la valida con CardInPlay.findOne({ zone:'hand', lock })
   * dentro de la misma transacción — más robusto que cualquier check en GameState.
   *
   * @param state              GameState actual (cosmos del jugador)
   * @param playerNumber       1 o 2
   * @param dbZone             Zona destino en notación BD (usa ZoneMapper.toDatabase primero)
   * @param position           Posición en la zona (0-based)
   * @param cost               Costo de cosmos de la carta (de BD)
   * @param zoneCurrentCount   Cantidad actual de cartas en dbZone (leída con lock)
   * @param positionOccupied   True si la posición ya está ocupada (leída con lock)
   */
  static validatePlayCard(
    state: GameState,
    playerNumber: 1 | 2,
    _cardId: string,         // reservado para cuando el mapper pueble player.hand
    dbZone: string,
    position: number,
    cost: number,
    zoneCurrentCount: number,
    positionOccupied: boolean,
  ): ValidationResult {
    const player = playerNumber === 1 ? state.player1 : state.player2;

    // Cosmos suficiente
    if (player.cosmos < cost)
      return { valid: false, error: `Cosmos insuficiente. Requiere: ${cost}, tienes: ${player.cosmos}` };

    // Zona válida y con espacio
    const max = ZoneMapper.maxCards(dbZone);
    if (max !== null && zoneCurrentCount >= max)
      return { valid: false, error: `Zona ${dbZone} está llena (máximo ${max})` };

    // Posición libre
    if (positionOccupied)
      return { valid: false, error: `La posición ${position} en ${dbZone} ya está ocupada` };

    return { valid: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EXECUTE PLAY CARD
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Calcula el nuevo estado tras jugar una carta.
   * Actualiza cosmos del jugador y mueve la carta de hand → zone en GameState.
   * El movimiento "físico" en la BD lo hace el manager (cardInPlay.update).
   *
   * Mover la carta en GameState es crítico para que MatchRepository.applyState
   * incluya la carta en liveInstanceIds y no la barra al yomotsu (step 5).
   *
   * @param cardId   instance_id de la carta (para buscarla en player.hand)
   * @param dbZone   Zona destino en notación BD
   * @param position Posición en la zona
   * @param bdStats  Stats completos de la carta
   */
  static executePlayCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    dbZone: string,
    position: number,
    bdStats: CardBdStats,
  ): { newState: GameState; cosmosDelta: number } {
    const newState = cloneState(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const cosmosDelta = (bdStats.generate ?? 0) - (bdStats.cost ?? 0);
    player.cosmos = Math.max(0, player.cosmos + cosmosDelta);

    // Mover carta de hand → zone en GameState
    const handIdx = player.hand.findIndex(c => c.instance_id === cardId);
    if (handIdx >= 0) {
      const [card] = player.hand.splice(handIdx, 1);
      card.zone = dbZone;
      card.position = position;
      // Inicializar stats de combate para caballeros entrando al campo
      if (bdStats.card_type === 'knight') {
        if (!card.current_health) card.current_health = bdStats.health ?? 0;
        if (!card.ce)             { card.ce = bdStats.attack ?? 0; card.base_ce = bdStats.attack ?? 0; }
        if (!card.ar)             { card.ar = bdStats.defense ?? 0; card.base_ar = bdStats.defense ?? 0; }
        if (!card.current_cosmos) card.current_cosmos = bdStats.cosmos ?? 0;
      }
      if      (dbZone === 'field_knight')  player.field_knights.push(card);
      else if (dbZone === 'field_support') player.field_techniques.push(card);
      else if (dbZone === 'field_helper')  player.field_helper = card;
    }

    newState.updated_at = Date.now();
    return { newState, cosmosDelta };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIAL STATS for knight cards (called by manager when placing)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Devuelve los stats iniciales con los que debe quedar CardInPlay al entrar al campo.
   * Solo aplica para cartas tipo 'knight'. Para otros tipos devuelve {}.
   */
  static initialKnightStats(
    cardInPlay: Record<string, any>,
    bdStats: CardBdStats,
  ): Partial<Record<string, number>> {
    if (bdStats.card_type !== 'knight') return {};
    return {
      current_health:  (cardInPlay['current_health']  || 0) === 0 ? (bdStats.health  ?? 0) : undefined,
      current_attack:  (cardInPlay['current_attack']  || 0) === 0 ? (bdStats.attack  ?? 0) : undefined,
      current_defense: (cardInPlay['current_defense'] || 0) === 0 ? (bdStats.defense ?? 0) : undefined,
      current_cosmos:  (cardInPlay['current_cosmos']  || 0) === 0 ? (bdStats.cosmos  ?? 0) : undefined,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DISCARD / MOVE  (stubs — manager calls these when ready)
  // ══════════════════════════════════════════════════════════════════════════

  /** (FUTURO) Mover carta dentro del campo. */
  static moveCard(
    state: GameState,
    _playerNumber: 1 | 2,
    _cardId: string,
    _fromZone: string,
    _toZone: string,
    _toPosition: number,
  ): { newState: GameState } {
    // TODO: implementar
    return { newState: cloneState(state) };
  }

  /** (FUTURO) Descartar carta. */
  static discardCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
  ): { newState: GameState } {
    const newState = cloneState(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    for (const zone of [player.hand, player.field_knights, player.field_techniques]) {
      const index = zone.findIndex(c => c.instance_id === cardId);
      if (index >= 0) {
        zone.splice(index, 1);
        player.graveyard_count += 1;
        break;
      }
    }

    newState.updated_at = Date.now();
    return { newState };
  }
}
