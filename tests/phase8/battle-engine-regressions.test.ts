import { AttackRulesEngine } from '../../src/engine/AttackRulesEngine';
import { TurnRulesEngine } from '../../src/engine/TurnRulesEngine';
import { createEmptyGameState, type CardInGameState } from '../../src/engine/GameState';
import { AbilityEngine } from '../../src/engine/abilities/AbilityEngine';

function createKnight(params: {
  id: string;
  player: 1 | 2;
  ce?: number;
  ar?: number;
  hp?: number;
  effects?: any[];
}): CardInGameState {
  const ce = params.ce ?? 3;
  const ar = params.ar ?? 1;
  const hp = params.hp ?? 5;

  return {
    instance_id: params.id,
    card_id: `card-${params.id}`,
    card_type: 'knight',
    player_number: params.player,
    zone: 'field_knight',
    position: 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: params.effects ?? [],
    card_code: `code-${params.id}`,
    raw_abilities: [],
    ce,
    ar,
    current_health: hp,
    max_health: hp,
    current_cosmos: 0,
    base_ce: ce,
    base_ar: ar,
  };
}

describe('Battle Engine Regressions', () => {
  test('validateAttack fails when it is not the attacker player turn', () => {
    const state = createEmptyGameState('match-attack-turn');
    state.current_player = 2;
    state.phase = 'player2_turn';

    state.player1.field_knights.push(createKnight({ id: 'p1-attacker', player: 1 }));
    state.player2.field_knights.push(createKnight({ id: 'p2-defender', player: 2 }));

    const validation = AttackRulesEngine.validateAttack(
      state,
      1,
      'p1-attacker',
      'p2-defender',
    );

    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('No es turno del jugador 1');
  });

  test('changeDefensiveMode fails when phase/turn are invalid', () => {
    const state = createEmptyGameState('match-mode-turn');
    state.current_player = 2;
    state.phase = 'player2_turn';

    state.player1.field_knights.push(createKnight({ id: 'p1-knight', player: 1 }));

    const result = AttackRulesEngine.changeDefensiveMode(
      state,
      1,
      'p1-knight',
      'defense',
    );

    expect(result.error).toContain('No es turno del jugador 1');
    expect(result.newState.player1.field_knights[0].mode).toBe('normal');
  });

  test('DOT lethal damage removes knight from field and sends it to graveyard on endTurn', () => {
    const state = createEmptyGameState('match-dot-lethal');
    state.current_player = 1;
    state.phase = 'player1_turn';

    const poisonedKnight = createKnight({
      id: 'p2-burned',
      player: 2,
      hp: 2,
      effects: [{ type: 'burn', value: 3, remaining_turns: 1 }],
    });

    state.player2.field_knights.push(poisonedKnight);

    const { newState } = TurnRulesEngine.endTurn(state, 1);

    expect(newState.player2.field_knights.find(c => c.instance_id === 'p2-burned')).toBeUndefined();
    expect(newState.player2.graveyard.find(c => c.instance_id === 'p2-burned')).toBeDefined();
    expect(newState.player2.graveyard_count).toBe(1);
  });

  test('declarative kill sends target to graveyard and emits death events', () => {
    const state = createEmptyGameState('match-kill-action');
    state.current_player = 1;
    state.phase = 'player1_turn';

    state.player1.field_knights.push(createKnight({ id: 'p1-caster', player: 1 }));
    state.player2.field_knights.push(createKnight({ id: 'p2-target', player: 2, hp: 4 }));

    const execution = AbilityEngine.execute(
      {
        trigger: 'ACTIVE',
        actions: [{ type: 'kill', target: 'target' } as any],
      } as any,
      state,
      1,
      'p1-caster',
      {
        type: 'ACTIVE',
        playerNumber: 1,
        sourceCardId: 'p1-caster',
        targetCardId: 'p2-target',
      },
    );

    expect(execution.newState.player2.field_knights.find(c => c.instance_id === 'p2-target')).toBeUndefined();
    expect(execution.newState.player2.graveyard.find(c => c.instance_id === 'p2-target')).toBeDefined();

    const eventTypes = execution.events.map(event => event.type);
    expect(eventTypes).toContain('KNIGHT_DIED');
    expect(eventTypes).toContain('ALLY_DIED');
  });
});
