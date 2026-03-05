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
import { StatusEffect, deriveModeFromEffects, computeCeBonus, computeArBonus, parseStatusEffects } from '../../engine/StatusEffects';
import { xmur3 } from '../../engine/combat/RNG';
import CardInPlay from '../../models/CardInPlay';

// Asume que existen estos modelos
type Match = any;

function toEnginePhase(dbPhase: string): GameState['phase'] {
  if (dbPhase === 'finished') return 'game_over';
  if (dbPhase === 'player2_turn') return 'player2_turn';
  return 'player1_turn';
}

function toDbPhase(enginePhase: GameState['phase']): 'player1_turn' | 'player2_turn' | 'finished' {
  if (enginePhase === 'game_over') return 'finished';
  if (enginePhase === 'player2_turn') return 'player2_turn';
  return 'player1_turn';
}

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
    state.phase = toEnginePhase(match.phase);

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

    // Ganador
    state.winner_id = match.winner_id ?? null;

    // Semilla RNG: derivada deterministicamente del estado de la partida.
    // Se recalcula en cada carga; no necesita columna en BD.
    // Cambia con cada acción porque graveyard_count y cosmos avanzan.
    const graveyardTotal = (match.player1_graveyard_count || 0) + (match.player2_graveyard_count || 0);
    state.rng_seed = xmur3(`${match.id}:${match.current_turn}:${graveyardTotal}:${match.player1_cosmos || 0}:${match.player2_cosmos || 0}`);

    // Cartas en juego (si el match fue cargado con include: cards_in_play)
    const cards: any[] = match.cards_in_play ?? match.cardsInPlay ?? [];
    for (const card of cards) {
      const cardState = this._mapCardToState(card);
      const targetPlayer = card.player_number === 1 ? state.player1 : state.player2;

      switch (card.zone) {
        case 'hand':         targetPlayer.hand.push(cardState); break;
        case 'field_knight': targetPlayer.field_knights.push(cardState); break;
        case 'field_support':targetPlayer.field_techniques.push(cardState); break;
        case 'field_helper': targetPlayer.field_helper = cardState; break;
      }
    }

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
      phase: toDbPhase(state.phase),
      winner_id: state.winner_id ?? null,
      finished_at: state.phase === 'game_over' ? new Date() : undefined,
      updated_at: new Date(),
    };
  }

  /**
   * Convierte CardInPlay (BD) → CardInGameState (estado puro).
   * El mode y los stats con boost se DERIVAN de status_effects.
   */
  private static _mapCardToState(card: any): CardInGameState {
    // Parsear efectos de estado desde JSON
    const effects: StatusEffect[] = parseStatusEffects(card.status_effects);

    // Stats base (sin boosts)
    const base_ce: number = card.current_attack  ?? card.base_ce  ?? 0;
    const base_ar: number = card.current_defense ?? card.base_ar  ?? 0;

    return {
      instance_id: card.id,
      card_id: card.card_id,
      card_type: card.card?.type || 'unknown',
      player_number: card.player_number as 1 | 2,
      zone: card.zone,
      position: card.position,

      // Mode derivado de status_effects (fuente de verdad)
      mode: deriveModeFromEffects(effects),

      is_exhausted: card.has_attacked_this_turn ?? false,
      attacked_this_turn: card.has_attacked_this_turn ?? false,

      status_effects: effects,

      // Stats con boosts aplicados
      base_ce,
      base_ar,
      ce:   base_ce + computeCeBonus(effects),
      ar:   base_ar + computeArBonus(effects),
      current_health: card.current_health ?? 0,
    };
  }
}
