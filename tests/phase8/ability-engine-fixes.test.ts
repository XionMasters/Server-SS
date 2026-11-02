import { AttackRulesEngine } from '../../src/domain/game/AttackRulesEngine';
import { TechniqueRulesEngine } from '../../src/domain/game/TechniqueRulesEngine';
import { TurnRulesEngine } from '../../src/domain/game/TurnRulesEngine';
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { AbilityEngine } from '../../src/domain/game/abilities/AbilityEngine';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';
import { heal } from '../../src/domain/game/actions/HealAction';
import { isImmobilized } from '../../src/domain/game/StatusEffects';
import { ActionResolver } from '../../src/app/matches/actions/ActionResolver';

function createKnight(params: {
  id: string;
  player: 1 | 2;
  ce?: number;
  ar?: number;
  hp?: number;
  effects?: any[];
  abilities?: any[];
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
    tags: ['bronze'],
    raw_abilities: params.abilities ?? [],
    ce,
    ar,
    current_health: hp,
    max_health: hp,
    current_cosmos: 5,
    base_ce: ce,
    base_ar: ar,
  };
}

function p1TurnState(id: string): GameState {
  const state = createEmptyGameState(id);
  state.current_player = 1;
  state.phase = 'player1_turn';
  return state;
}

const activeEvent = (sourceCardId: string, targetCardId?: string) => ({
  type: 'ACTIVE' as const,
  playerNumber: 1 as const,
  sourceCardId,
  ...(targetCardId ? { targetCardId } : {}),
});

describe('Duración de parálisis / congelación', () => {
  test('la parálisis de electric_charge sigue activa durante el turno del defensor', () => {
    const state = p1TurnState('par-duration');
    state.player1.field_knights.push(createKnight({
      id: 'atk', player: 1, effects: [{ type: 'electric_charge', remaining_turns: null }],
    }));
    state.player2.field_knights.push(createKnight({ id: 'def', player: 2, hp: 20 }));

    const { newState: afterAttack } = AttackRulesEngine.attack(state, 1, 'atk', 'def');
    const { newState: defenderTurn } = TurnRulesEngine.endTurn(afterAttack, 1);

    const defender = defenderTurn.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(isImmobilized(defender.status_effects)).toBe(true);
    expect(AttackRulesEngine.validateAttack(defenderTurn, 2, 'def', null).valid).toBe(false);
  });

  test('la parálisis de una TA sigue activa durante el turno del defensor', () => {
    const state = p1TurnState('ta-par-duration');
    state.player1.field_knights.push(createKnight({
      id: 'atk', player: 1, effects: [{ type: 'ta_causes_par', remaining_turns: null }],
    }));
    state.player1.field_techniques.push({ ...createKnight({ id: 'tech', player: 1 }), card_type: 'technique' });
    state.player2.field_knights.push(createKnight({ id: 'def', player: 2, hp: 20 }));

    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', {
      hit_count: 1, hit_ce: 2, ta_cost: 0, compatible_tags: ['bronze'],
    });
    const { newState: defenderTurn } = TurnRulesEngine.endTurn(newState, 1);

    const defender = defenderTurn.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(isImmobilized(defender.status_effects)).toBe(true);
  });

  test('immune_negative bloquea la parálisis', () => {
    const state = p1TurnState('immune-par');
    state.player1.field_knights.push(createKnight({
      id: 'atk', player: 1, effects: [{ type: 'electric_charge', remaining_turns: null }],
    }));
    state.player2.field_knights.push(createKnight({
      id: 'def', player: 2, hp: 20, effects: [{ type: 'immune_negative', remaining_turns: null }],
    }));

    const { newState } = AttackRulesEngine.attack(state, 1, 'atk', 'def');
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(defender.status_effects.some(e => e.type === 'paralyzed')).toBe(false);
  });
});

describe('Determinación Interior (last_stand) en cualquier fuente de daño', () => {
  test('apply_damage de una habilidad no mata a un caballero con last_stand', () => {
    const state = p1TurnState('last-stand-ability');
    state.player1.field_knights.push(createKnight({ id: 'caster', player: 1 }));
    state.player2.field_knights.push(createKnight({
      id: 'seiya', player: 2, hp: 2, effects: [{ type: 'last_stand', remaining_turns: null }],
    }));

    const { newState } = AbilityEngine.execute(
      { trigger: 'ACTIVE', actions: [{ type: 'apply_damage', target: 'target', amount: 10 } as any] } as any,
      state, 1, 'caster', activeEvent('caster', 'seiya'),
    );

    const seiya = newState.player2.field_knights.find(c => c.instance_id === 'seiya')!;
    expect(seiya.current_health).toBe(1);
    expect(seiya.status_effects.some(e => e.type === 'last_stand_active')).toBe(true);
    expect(seiya.status_effects.some(e => e.type === 'last_stand')).toBe(false);
  });

  test('last_stand_active anula el daño de una TA', () => {
    const state = p1TurnState('last-stand-ta');
    state.player1.field_knights.push(createKnight({ id: 'atk', player: 1 }));
    state.player1.field_techniques.push({ ...createKnight({ id: 'tech', player: 1 }), card_type: 'technique' });
    state.player2.field_knights.push(createKnight({
      id: 'seiya', player: 2, hp: 1, effects: [{ type: 'last_stand_active', remaining_turns: 1 }],
    }));

    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'seiya', {
      hit_count: 3, hit_ce: 9, ta_cost: 0, compatible_tags: ['bronze'],
    });

    expect(newState.player2.field_knights.find(c => c.instance_id === 'seiya')?.current_health).toBe(1);
  });
});

describe('Pasivas', () => {
  test('CARD_PLAYED solo dispara las habilidades de la carta jugada', () => {
    const drawOnEnter = {
      ability_key: 'draw_on_enter',
      type: 'pasiva',
      effects: { trigger: 'CARD_PLAYED', actions: [{ type: 'draw_card', amount: 1 }] },
    };
    const state = p1TurnState('card-played-scope');
    state.player1.deck_count = 10;
    state.player1.field_knights.push(createKnight({ id: 'marin', player: 1, abilities: [drawOnEnter] }));
    state.player1.field_knights.push(createKnight({ id: 'other', player: 1 }));

    const ctx = createEngineContext(state);
    ctx.bus.emit(createEvent({ type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: 'other' }));

    expect(ctx.state.player1.deck_count).toBe(10);
  });

  test('TURN_END con event_player_is_self solo reacciona al turno del dueño', () => {
    const moraleUp = {
      ability_key: 'morale_up',
      type: 'pasiva',
      effects: {
        trigger: 'TURN_END',
        conditions: [{ type: 'event_player_is_self' }],
        actions: [{ type: 'apply_status', status: 'ce_boost', value: 1, target: 'self' }],
      },
    };
    const state = p1TurnState('turn-end-scope');
    state.player1.field_knights.push(createKnight({ id: 'k', player: 1, abilities: [moraleUp] }));

    const ctx = createEngineContext(state);
    ctx.bus.emit(createEvent({ type: 'TURN_END', playerNumber: 2 }));
    expect(ctx.state.player1.field_knights[0].status_effects).toHaveLength(0);

    ctx.bus.emit(createEvent({ type: 'TURN_END', playerNumber: 1 }));
    expect(ctx.state.player1.field_knights[0].status_effects.map(e => e.type)).toEqual(['ce_boost']);
  });
});

describe('Efectos varios', () => {
  test('unicorn_horn añade 1 DIP al rival en cada BA que conecta', () => {
    const state = p1TurnState('unicorn-horn');
    state.player1.field_knights.push(createKnight({
      id: 'jabu', player: 1, effects: [{ type: 'unicorn_horn', remaining_turns: null }],
    }));
    state.player2.field_knights.push(createKnight({ id: 'def', player: 2, hp: 20 }));
    const lifeBefore = state.player2.life;

    const { newState } = AttackRulesEngine.attack(state, 1, 'jabu', 'def');
    expect(newState.player2.life).toBe(lifeBefore - 1);
  });

  test('heal no supera el HP máximo', () => {
    const state = p1TurnState('heal-cap');
    const knight = createKnight({ id: 'k', player: 1, hp: 8 });
    knight.current_health = 6;
    state.player1.field_knights.push(knight);

    const ctx = createEngineContext(state);
    heal(ctx, 'k', 5);
    expect(ctx.state.player1.field_knights[0].current_health).toBe(8);
  });

  test('pagar vida hasta 0 termina la partida', () => {
    const state = p1TurnState('life-cost');
    state.player1.life = 2;
    state.player1.field_knights.push(createKnight({ id: 'k', player: 1 }));

    const { newState } = AbilityEngine.execute(
      { trigger: 'ACTIVE', cost: [{ type: 'life', amount: 2 }], actions: [] } as any,
      state, 1, 'k', activeEvent('k'),
    );
    expect(newState.phase).toBe('game_over');
  });

  test('descarte con objetivo en campo pide selección y conserva el objetivo', () => {
    const state = p1TurnState('discard-target');
    state.player1.field_knights.push(createKnight({ id: 'k', player: 1 }));
    state.player1.hand.push({ ...createKnight({ id: 'h1', player: 1 }), zone: 'hand' });
    state.player2.field_knights.push(createKnight({ id: 'enemy', player: 2 }));
    const def = {
      trigger: 'ACTIVE',
      cost: [{ type: 'discard', target: 'self_hand' }],
      actions: [{ type: 'apply_status', status: 'burn', value: 1, duration: 2, target: 'target' }],
    } as any;

    expect(AbilityEngine.canActivate(def, state, 1, 'k', activeEvent('k', 'enemy')).valid).toBe(true);
    const { newState, extras } = AbilityEngine.execute(def, state, 1, 'k', activeEvent('k', 'enemy'));
    expect(extras?.selection_required).toBe(true);
    expect(newState.pending_selection?.target_card_id).toBe('enemy');
    expect(newState.player1.hand).toHaveLength(1);
  });

  test('descarte con carta de la mano indicada se paga directamente', () => {
    const state = p1TurnState('discard-direct');
    state.player1.field_knights.push(createKnight({ id: 'k', player: 1 }));
    state.player1.hand.push({ ...createKnight({ id: 'h1', player: 1 }), zone: 'hand' });
    const def = {
      trigger: 'ACTIVE',
      cost: [{ type: 'discard', target: 'self_hand' }],
      actions: [{ type: 'apply_status', status: 'ignore_armor', target: 'self' }],
    } as any;

    const { newState, extras } = AbilityEngine.execute(def, state, 1, 'k', activeEvent('k', 'h1'));
    expect(extras?.discard_card_id).toBe('h1');
    expect(newState.player1.hand).toHaveLength(0);
    expect(newState.player1.costos_count).toBe(1);
  });
});

describe('ActionResolver — habilidades activas', () => {
  const serialized = (overrides: Record<string, any>) => ({
    player_number: 1,
    zone: 'field_knight',
    position: 0,
    current_cosmos: 5,
    current_health: 8,
    current_attack: 3,
    status_effects: [],
    has_attacked_this_turn: false,
    can_attack_this_turn: true,
    ...overrides,
  });

  test('ofrece una activa con coste de descarte si hay cartas en mano, usando ability_key', () => {
    const knight = serialized({
      id: 'k',
      base_data: {
        code: 'kanon', type: 'knight', tags: [],
        abilities: [{
          name: 'Triángulo Dorado',
          ability_key: 'triangulo_dorado',
          type: 'activa',
          effects: { trigger: 'ACTIVE', cost: [{ type: 'discard' }], actions: [{ type: 'apply_status', status: 'ignore_armor' }] },
        }],
      },
    });
    const handCard = serialized({ id: 'h', zone: 'hand', base_data: { code: 'x', type: 'knight', tags: [] } });

    const [resolved] = ActionResolver.resolve([knight, handCard], { current_player: 1, player1_life: 10 });
    expect(resolved.valid_actions.active_abilities).toEqual([
      { ability_name: 'triangulo_dorado', cosmos_cost: 0 },
    ]);
  });

  test('evalúa hp_below con la vida real de la carta', () => {
    const divineFrenzy = {
      name: 'Divine Frenzy',
      ability_key: 'divine_frenzy',
      type: 'activa',
      effects: { trigger: 'ACTIVE', conditions: [{ type: 'hp_below', amount: 5 }], actions: [] },
    };
    const healthy = serialized({ id: 'k', current_health: 9, base_data: { code: 's', type: 'knight', tags: [], abilities: [divineFrenzy] } });

    const [resolved] = ActionResolver.resolve([healthy], { current_player: 1 });
    expect(resolved.valid_actions.active_abilities).toEqual([]);
  });
});
