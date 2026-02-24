/**
 * MatchStateMapper.ts
 * 
 * Convierte Match (modelo Sequelize) ↔ GameState (estado puro).
 * 
 * ⚠️ CRÍTICO: Este es el ÚNICO place que puede leer modelo BD para llenar el engine.
 * El engine NO conoce de esto.
 * 
 * Responsabilidades:
 * ✅ Leer Match y relacionadas (CardInPlay, etc.)
 * ✅ Convertir a GameState (estado puro)
 * ✅ Asegurar que GameState es válido
 * 
 * Flujo:
 * Match (BD) → MatchStateMapper → GameState (puro) → TurnRulesEngine
 * 
 * IMPORTANTE: Los cambios en GameState NO se reflejan en Match automáticamente.
 * Eso es responsabilidad de MatchRepository.
 */

import { GameState, Player, CardInGameState, createEmptyGameState } from '../../engine/GameState';

// Asume que existen estos modelos
type Match = any;
type CardInPlay = any;

export class MatchStateMapper {
  /**
   * Convierte Match (modelo BD) → GameState (estado puro)
   * 
   * ⚠️ Síncrono - Esta lectura de BD ya fue hecha
   * No hace queries nuevas, solo deserializa datos en memoria
   */
  static fromMatch(match: Match): GameState {
    // Crear estado base
    const state = createEmptyGameState(match.id);

    // Llenar datos de jugadores
    state.player1.id = match.player1_id;
    state.player1.life = match.player1_life;
    state.player1.cosmos = match.player1_cosmos;
    state.player1.deck_count = match.player1_deck_size;
    state.player1.graveyard_count = match.player1_graveyard_count || 0;
    state.player1.costos_count = match.player1_costos_count || 0;

    state.player2.id = match.player2_id;
    state.player2.life = match.player2_life;
    state.player2.cosmos = match.player2_cosmos;
    state.player2.deck_count = match.player2_deck_size;
    state.player2.graveyard_count = match.player2_graveyard_count || 0;
    state.player2.costos_count = match.player2_costos_count || 0;

    // Llenar datos del turno
    state.current_turn = match.current_turn;
    state.current_player = match.current_player;
    state.phase = match.phase;

    // (FUTURO) Llenar cartas en juego
    // if (match.cardsInPlay && match.cardsInPlay.length > 0) {
    //   match.cardsInPlay.forEach((card: CardInPlay) => {
    //     const cardState = this._mapCardToState(card);
    //     const targetPlayer = card.player_number === 1 ? state.player1 : state.player2;

    //     if (card.zone === 'hand') {
    //       targetPlayer.hand.push(cardState);
    //     } else if (card.zone === 'field_knight') {
    //       targetPlayer.field_knights.push(cardState);
    //     } else if (card.zone === 'field_technique') {
    //       targetPlayer.field_techniques.push(cardState);
    //     }
    //     // ... otros campos ...
    //   });
    // }

    // (FUTURO) Llenar escenario
    // if (match.scenario) {
    //   state.scenario = {
    //     instance_id: match.scenario.id,
    //     card_id: match.scenario.card_id,
    //     card_name: match.scenario.name,
    //     effect: match.scenario.effect,
    //   };
    // }

    // Timestamps
    state.created_at = match.createdAt?.getTime() || Date.now();
    state.updated_at = match.updatedAt?.getTime() || Date.now();

    return state;
  }

  /**
   * (FUTURO) Convierte GameState → Updates en Match
   * 
   * No retorna un nuevo Match, sino que especifica
   * qué campos del Match deben ser actualizados.
   * 
   * Usado por MatchRepository.applyState()
   */
  static getUpdatesFromState(state: GameState): Partial<Match> {
    return {
      player1_life: state.player1.life,
      player1_cosmos: state.player1.cosmos,
      player1_deck_size: state.player1.deck_count,
      player2_life: state.player2.life,
      player2_cosmos: state.player2.cosmos,
      player2_deck_size: state.player2.deck_count,
      current_turn: state.current_turn,
      current_player: state.current_player,
      phase: state.phase,
      updated_at: new Date(),
    };
  }

  /**
   * (FUTURO) Convierte CardInPlay (BD) → CardInGameState (estado puro)
   */
  private static _mapCardToState(card: CardInPlay): CardInGameState {
    return {
      instance_id: card.id,
      card_id: card.card_id,
      card_type: card.card?.type || 'unknown',
      player_number: card.player_number as 1 | 2,
      zone: card.zone,
      position: card.position,
      mode: card.mode,
      is_exhausted: card.is_exhausted,
      attacked_this_turn: card.attacked_this_turn || false,
      status_effects: card.status_effects || [],
      buffs: card.buffs || {},
    };
  }
}
