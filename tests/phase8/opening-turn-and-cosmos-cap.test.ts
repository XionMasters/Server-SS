/**
 * Reglas de partida:
 *  - Primer turno: quien empieza no puede atacar al jugador rival (BA ni TA directos).
 *  - El cosmo de cada jugador tiene un máximo de 12.
 */
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { AttackRulesEngine } from '../../src/domain/game/AttackRulesEngine';
import { TechniqueRulesEngine, type TechniqueStats } from '../../src/domain/game/TechniqueRulesEngine';
import { TurnRulesEngine } from '../../src/domain/game/TurnRulesEngine';
import { KnightRulesEngine } from '../../src/domain/game/KnightRulesEngine';
import { CardRulesEngine } from '../../src/domain/game/CardRulesEngine';
import { isOpeningTurn, OPENING_TURN_DIRECT_ATTACK_ERROR } from '../../src/domain/game/rules/opening-turn.rules';
import { MAX_PLAYER_COSMOS } from '../../src/domain/game/rules/cosmos.rules';
import { ActionResolver } from '../../src/app/matches/actions/ActionResolver';

function knight(id: string, player: 1 | 2, params: Partial<CardInGameState> = {}): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'knight',
    player_number: player,
    zone: 'field_knight',
    position: 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: [],
    card_code: `code-${id}`,
    tags: ['dragon'],
    raw_abilities: [],
    ce: 3,
    ar: 1,
    current_health: 5,
    max_health: 5,
    current_cosmos: 3,
    base_ce: 3,
    base_ar: 1,
    ...params,
  };
}

function state(turn: number, current: 1 | 2, first: 1 | 2): GameState {
  const s = createEmptyGameState('reglas');
  s.current_turn = turn;
  s.current_player = current;
  s.first_player = first;
  s.phase = current === 1 ? 'player1_turn' : 'player2_turn';
  return s;
}

describe('Primer turno de la partida', () => {
  test('isOpeningTurn: solo el turno 1 de quien empezó', () => {
    expect(isOpeningTurn({ current_turn: 1, current_player: 1, first_player: 1 })).toBe(true);
    expect(isOpeningTurn({ current_turn: 1, current_player: 2, first_player: 1 })).toBe(false); // el rival ya jugó
    expect(isOpeningTurn({ current_turn: 1, current_player: 2, first_player: 2 })).toBe(true);
    expect(isOpeningTurn({ current_turn: 2, current_player: 1, first_player: 2 })).toBe(false);
    expect(isOpeningTurn({ current_turn: 1, current_player: 1 })).toBe(false); // sin dato: no restringe
  });

  test('BA directo: bloqueado en el primer turno, permitido después', () => {
    const opening = state(1, 1, 1);
    opening.player1.field_knights.push(knight('a', 1));
    expect(AttackRulesEngine.validateAttack(opening, 1, 'a', null))
      .toEqual({ valid: false, error: OPENING_TURN_DIRECT_ATTACK_ERROR });

    const rivalFirstTurn = state(1, 2, 1);
    rivalFirstTurn.player2.field_knights.push(knight('b', 2));
    expect(AttackRulesEngine.validateAttack(rivalFirstTurn, 2, 'b', null).valid).toBe(true);
  });

  test('si empieza el jugador 2, su turno 1 también está bloqueado', () => {
    const s = state(1, 2, 2);
    s.player2.field_knights.push(knight('b', 2));
    expect(AttackRulesEngine.validateAttack(s, 2, 'b', null).valid).toBe(false);
  });

  test('atacar a un caballero sí está permitido en el primer turno', () => {
    const s = state(1, 1, 1);
    s.player1.field_knights.push(knight('a', 1));
    s.player2.field_knights.push(knight('enemigo', 2));
    expect(AttackRulesEngine.validateAttack(s, 1, 'a', 'enemigo').valid).toBe(true);
  });

  test('TA directa: bloqueada en el primer turno', () => {
    const stats: TechniqueStats = { hit_count: 1, hit_ce: 3, ta_cost: 0, compatible_tags: ['dragon'] };
    const s = state(1, 1, 1);
    s.player1.field_knights.push(knight('a', 1));
    s.player1.field_techniques.push(knight('tec', 1, { card_type: 'technique', zone: 'field_support' }));

    expect(TechniqueRulesEngine.validateTechniqueAttack(s, 1, 'a', 'tec', null, stats).valid).toBe(false);
    expect(TechniqueRulesEngine.validateTechniqueAttack(s, 1, 'a', 'tec', null, { ...stats, target_all: true }).valid).toBe(false);

    s.current_turn = 2;
    expect(TechniqueRulesEngine.validateTechniqueAttack(s, 1, 'a', 'tec', null, stats).valid).toBe(true);
  });

  test('valid_actions: sin rivales en el primer turno no ofrece atacar', () => {
    const cards = [{
      id: 'k1', player_number: 1, zone: 'field_knight', position: 0,
      has_attacked_this_turn: false, can_attack_this_turn: true, status_effects: [], card: { tags: [] },
    }];
    const opening = ActionResolver.resolve(cards, { current_player: 1, current_turn: 1, first_player: 1, player1_cosmos: 1 });
    expect(opening[0].valid_actions.can_attack).toBe(false);
    expect(opening[0].valid_actions.attack_targets).toBeNull();

    const later = ActionResolver.resolve(cards, { current_player: 1, current_turn: 2, first_player: 1, player1_cosmos: 1 });
    expect(later[0].valid_actions.can_attack).toBe(true);
    expect(later[0].valid_actions.attack_targets).toEqual([]);
  });
});

describe('Cosmo máximo del jugador', () => {
  test('el máximo es 12', () => {
    expect(MAX_PLAYER_COSMOS).toBe(12);
  });

  test('el cosmo del inicio de turno no pasa de 12', () => {
    const s = state(3, 1, 1);
    s.player2.cosmos = 12;
    const { newState } = TurnRulesEngine.endTurn(s, 1);
    expect(newState.player2.cosmos).toBe(12);
  });

  test('Cargar Cosmo: se rechaza con 12 y llega justo a 12 desde 11', () => {
    const full = state(3, 1, 1);
    full.player1.cosmos = 12;
    expect(KnightRulesEngine.validateChargeKnightCosmos(full, 1).valid).toBe(false);

    const almost = state(3, 1, 1);
    almost.player1.cosmos = 11;
    expect(KnightRulesEngine.validateChargeKnightCosmos(almost, 1).valid).toBe(true);
    const { newState, cosmosGained } = KnightRulesEngine.chargeKnightCosmos(almost, 1);
    expect(newState.player1.cosmos).toBe(12);
    expect(cosmosGained).toBe(1);
  });

  test('Cargar Cosmo gasta la acción del caballero que carga', () => {
    const s = state(3, 1, 1);
    s.player1.cosmos = 4;
    s.player1.field_knights.push(knight('k1', 1), knight('k2', 1, { position: 1 }));

    expect(KnightRulesEngine.validateChargeKnightCosmos(s, 1, 'k1').valid).toBe(true);
    const { newState } = KnightRulesEngine.chargeKnightCosmos(s, 1, 'k1');
    expect(newState.player1.cosmos).toBe(5);
    expect(newState.player1.field_knights.find(k => k.instance_id === 'k1')!.attacked_this_turn).toBe(true);
    // El original no se muta
    expect(s.player1.field_knights[0].attacked_this_turn).toBe(false);

    // Ese caballero ya no puede volver a cargar; otro sí
    expect(KnightRulesEngine.validateChargeKnightCosmos(newState, 1, 'k1').valid).toBe(false);
    expect(KnightRulesEngine.validateChargeKnightCosmos(newState, 1, 'k2').valid).toBe(true);
    // Un caballero que no es del jugador no puede cargar
    expect(KnightRulesEngine.validateChargeKnightCosmos(newState, 1, 'ajeno').valid).toBe(false);
  });

  test('jugar una carta que genera cosmo no pasa de 12', () => {
    const s = state(3, 1, 1);
    s.player1.cosmos = 11;
    s.player1.hand.push(knight('gen', 1, { zone: 'hand' }));
    const { newState } = CardRulesEngine.executePlayCard(s, 1, 'gen', 'field_knight', 0, { cost: 0, generate: 3 } as any);
    expect(newState.player1.cosmos).toBe(12);
  });

  test('valid_actions: con el cosmo lleno no ofrece Cargar Cosmo', () => {
    const cards = [{
      id: 'k1', player_number: 1, zone: 'field_knight', position: 0,
      has_attacked_this_turn: false, can_attack_this_turn: true, status_effects: [], card: { tags: [] },
    }];
    const full = ActionResolver.resolve(cards, { current_player: 1, current_turn: 3, player1_cosmos: 12 });
    expect(full[0].valid_actions.can_charge).toBe(false);
    const notFull = ActionResolver.resolve(cards, { current_player: 1, current_turn: 3, player1_cosmos: 11 });
    expect(notFull[0].valid_actions.can_charge).toBe(true);
  });
});
