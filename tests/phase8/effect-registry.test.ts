/**
 * effect-registry.test.ts
 *
 * Tests unitarios para AttackEffectRegistry y TechniqueEffectRegistry.
 * Ambos registries son pure functions — no necesitan BD ni WebSocket.
 */

import { applyBasicAttackSideEffects, BasicAttackEffectContext } from '../../src/engine/attack/AttackEffectRegistry';
import { applyTechniqueSemanticEffect, TechniqueSemanticContext, TaComboAction } from '../../src/engine/technique/TechniqueEffectRegistry';
import { createEmptyGameState, type CardInGameState, type Player } from '../../src/engine/GameState';
import { GameEventBus } from '../../src/engine/events/GameEventBus';
import type { EngineContext } from '../../src/engine/EngineContext';
import type { StatusEffect, StatusEffectType } from '../../src/engine/StatusEffects';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Crea un EngineContext sin PassiveTriggerEngine (para tests unitarios). */
function makeEngineCtx(matchId = 'test-match'): EngineContext {
  const state = createEmptyGameState(matchId);
  const bus = new GameEventBus(); // no-op callback
  return { state, bus };
}

function makeKnight(params: {
  id: string;
  player: 1 | 2;
  ce?: number;
  ar?: number;
  hp?: number;
  effects?: StatusEffect[];
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
    tags: [],
    raw_abilities: [],
    ce,
    ar,
    current_health: hp,
    max_health: hp,
    current_cosmos: 5,
    base_ce: ce,
    base_ar: ar,
  };
}

function makeEffect(type: StatusEffectType, extra: Partial<StatusEffect> = {}): StatusEffect {
  return {
    type,
    remaining_turns: 1,
    ...extra,
  } as StatusEffect;
}

// ─── AttackEffectRegistry ─────────────────────────────────────────────────────

describe('AttackEffectRegistry', () => {
  describe('electric_charge', () => {
    test('aplica paralysis al defensor cuando el atacante tiene electric_charge', () => {
      const ctx = makeEngineCtx('test-electric');
      const attacker = makeKnight({
        id: 'attacker',
        player: 1,
        effects: [makeEffect('electric_charge')],
      });
      const defender = makeKnight({ id: 'defender', player: 2 });

      ctx.state.player1.field_knights.push(attacker);
      ctx.state.player2.field_knights.push(defender);

      const registryCtx: BasicAttackEffectContext = {
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: false,
      };

      applyBasicAttackSideEffects(registryCtx);

      const defenderInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'defender')!;
      const paralyzed = defenderInState.status_effects.find(e => e.type === 'paralyzed');
      expect(paralyzed).toBeDefined();
      expect(paralyzed?.remaining_turns).toBe(1);
    });

    test('NO aplica paralysis si el ataque fue evadido', () => {
      const ctx = makeEngineCtx('test-electric-evade');
      const attacker = makeKnight({
        id: 'attacker',
        player: 1,
        effects: [makeEffect('electric_charge')],
      });
      const defender = makeKnight({ id: 'defender', player: 2 });

      ctx.state.player1.field_knights.push(attacker);
      ctx.state.player2.field_knights.push(defender);

      applyBasicAttackSideEffects({
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: true,
      });

      const defenderInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'defender')!;
      expect(defenderInState.status_effects.find(e => e.type === 'paralyzed')).toBeUndefined();
    });

    test('NO aplica paralysis en ataque directo (sin defenderCardId)', () => {
      const ctx = makeEngineCtx('test-electric-direct');
      const attacker = makeKnight({
        id: 'attacker',
        player: 1,
        effects: [makeEffect('electric_charge')],
      });
      ctx.state.player1.field_knights.push(attacker);

      expect(() =>
        applyBasicAttackSideEffects({
          engineCtx: ctx,
          attacker,
          attackerCardId: attacker.instance_id,
          defenderCardId: null,
          playerNumber: 1,
          evaded: false,
        })
      ).not.toThrow();
    });
  });

  describe('dragon_rage', () => {
    test('aplica daño de cleave a adyacentes del defensor', () => {
      const ctx = makeEngineCtx('test-dragon-rage');
      const attacker = makeKnight({
        id: 'attacker',
        player: 1,
        ce: 5,
        effects: [makeEffect('dragon_rage')],
      });
      const leftNeighbor  = makeKnight({ id: 'left',  player: 2, ar: 1, hp: 10 });
      const defender      = makeKnight({ id: 'middle', player: 2, ar: 1, hp: 10 });
      const rightNeighbor = makeKnight({ id: 'right', player: 2, ar: 1, hp: 10 });

      ctx.state.player1.field_knights.push(attacker);
      // Posiciones 0=left, 1=middle, 2=right → middle es el defensor
      ctx.state.player2.field_knights.push(leftNeighbor, defender, rightNeighbor);

      applyBasicAttackSideEffects({
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: false,
      });

      // Cleave: max(1, CE_attacker - AR_neighbor) = max(1, 5-1) = 4
      const leftInState  = ctx.state.player2.field_knights.find(c => c.instance_id === 'left')!;
      const rightInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'right')!;
      expect(leftInState.current_health).toBe(10 - 4);
      expect(rightInState.current_health).toBe(10 - 4);
    });

    test('NOT aplica cleave si el ataque fue evadido', () => {
      const ctx = makeEngineCtx('test-dragon-evade');
      const attacker = makeKnight({
        id: 'attacker', player: 1, ce: 5,
        effects: [makeEffect('dragon_rage')],
      });
      const defender  = makeKnight({ id: 'middle', player: 2, hp: 10 });
      const neighbor  = makeKnight({ id: 'right',  player: 2, hp: 10 });

      ctx.state.player1.field_knights.push(attacker);
      ctx.state.player2.field_knights.push(defender, neighbor);

      applyBasicAttackSideEffects({
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: true,
      });

      const neighborInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'right')!;
      expect(neighborInState.current_health).toBe(10);
    });

    test('daño de cleave mínimo es 1', () => {
      const ctx = makeEngineCtx('test-dragon-min');
      const attacker = makeKnight({
        id: 'attacker', player: 1, ce: 1,
        effects: [makeEffect('dragon_rage')],
      });
      const defender = makeKnight({ id: 'middle', player: 2, ar: 0, hp: 10 });
      const neighbor = makeKnight({ id: 'right',  player: 2, ar: 99, hp: 10 });

      ctx.state.player1.field_knights.push(attacker);
      ctx.state.player2.field_knights.push(defender, neighbor);

      applyBasicAttackSideEffects({
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: false,
      });

      const neighborInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'right')!;
      // max(1, 1 - 99) = 1
      expect(neighborInState.current_health).toBe(9);
    });
  });

  describe('sin efectos especiales', () => {
    test('no lanza error y no modifica nada si el atacante no tiene efectos BA especiales', () => {
      const ctx = makeEngineCtx('test-no-effects');
      const attacker = makeKnight({ id: 'attacker', player: 1 });
      const defender = makeKnight({ id: 'defender', player: 2, hp: 5 });

      ctx.state.player1.field_knights.push(attacker);
      ctx.state.player2.field_knights.push(defender);

      applyBasicAttackSideEffects({
        engineCtx: ctx,
        attacker,
        attackerCardId: attacker.instance_id,
        defenderCardId: defender.instance_id,
        playerNumber: 1,
        evaded: false,
      });

      const defenderInState = ctx.state.player2.field_knights.find(c => c.instance_id === 'defender')!;
      expect(defenderInState.status_effects).toHaveLength(0);
      expect(defenderInState.current_health).toBe(5);
    });
  });
});

// ─── TechniqueEffectRegistry ──────────────────────────────────────────────────

describe('TechniqueEffectRegistry', () => {
  function makeBaseCtx(overrides: Partial<TechniqueSemanticContext> = {}): TechniqueSemanticContext {
    const knight   = makeKnight({ id: 'knight',   player: 1 });
    const defender = makeKnight({ id: 'defender', player: 2 });
    const defenderPlayer: Player = {
      id: 'player2', number: 2, life: 12, cosmos: 5,
      hand: [], field_knights: [defender], field_techniques: [],
      field_helper: null, field_occasion: null,
      deck_count: 40, graveyard: [], graveyard_count: 0,
      costos_count: 0, passive_watchers: [],
    };

    return {
      effect: makeEffect('ta_extra_damage_3'),
      knight,
      defenderCard: defender,
      defenderPlayer,
      playerNumber: 1,
      applyStatusToDefender: (statusType) => {
        defender.status_effects.push(makeEffect(statusType));
      },
      ...overrides,
    };
  }

  test('ta_causes_par_psn → aplica paralyzed y poison al defensor', () => {
    const defender = makeKnight({ id: 'defender', player: 2 });
    const appliedStatuses: StatusEffectType[] = [];

    applyTechniqueSemanticEffect({
      ...makeBaseCtx(),
      effect: makeEffect('ta_causes_par_psn'),
      defenderCard: defender,
      applyStatusToDefender: (s) => appliedStatuses.push(s),
    });

    expect(appliedStatuses).toContain('paralyzed');
    expect(appliedStatuses).toContain('poison');
  });

  test('ta_apply_status → aplica multiples estados desde params.status_types', () => {
    const appliedStatuses: StatusEffectType[] = [];

    applyTechniqueSemanticEffect({
      ...makeBaseCtx(),
      effect: makeEffect('ta_apply_status', {
        params: { status_types: ['paralyzed', 'poison'] },
      }),
      applyStatusToDefender: (s) => appliedStatuses.push(s),
    });

    expect(appliedStatuses).toEqual(['paralyzed', 'poison']);
  });

  test('ta_apply_status → permite repetir efectos poniendo dos veces el mismo', () => {
    const appliedStatuses: StatusEffectType[] = [];

    applyTechniqueSemanticEffect({
      ...makeBaseCtx(),
      effect: makeEffect('ta_apply_status', {
        params: { status_types: ['paralyzed', 'paralyzed'] },
      }),
      applyStatusToDefender: (s) => appliedStatuses.push(s),
    });

    expect(appliedStatuses).toEqual(['paralyzed', 'paralyzed']);
  });

  test('ta_causes_par_psn sin defensor → no aplica nada', () => {
    const appliedStatuses: StatusEffectType[] = [];
    applyTechniqueSemanticEffect({
      ...makeBaseCtx(),
      effect: makeEffect('ta_causes_par_psn'),
      defenderCard: null,
      applyStatusToDefender: (s) => appliedStatuses.push(s),
    });
    expect(appliedStatuses).toHaveLength(0);
  });

  test('ta_drains_target_cosmos → defensor queda con current_cosmos = 0', () => {
    const defender = makeKnight({ id: 'defender', player: 2 });
    defender.current_cosmos = 8;

    applyTechniqueSemanticEffect({
      ...makeBaseCtx({ defenderCard: defender }),
      effect: makeEffect('ta_drains_target_cosmos'),
    });

    expect(defender.current_cosmos).toBe(0);
  });

  test('ta_reduce_ar_2 → reduce ar y base_ar del defensor en 2', () => {
    const defender = makeKnight({ id: 'defender', player: 2, ar: 5 });
    defender.base_ar = 5;

    applyTechniqueSemanticEffect({
      ...makeBaseCtx({ defenderCard: defender }),
      effect: makeEffect('ta_reduce_ar_2'),
    });

    expect(defender.ar).toBe(3);
    expect(defender.base_ar).toBe(3);
  });

  test('ta_reduce_ar_2 → AR no baja de 0', () => {
    const defender = makeKnight({ id: 'defender', player: 2, ar: 1 });
    defender.base_ar = 1;

    applyTechniqueSemanticEffect({
      ...makeBaseCtx({ defenderCard: defender }),
      effect: makeEffect('ta_reduce_ar_2'),
    });

    expect(defender.ar).toBe(0);
    expect(defender.base_ar).toBe(0);
  });

  test('ta_modify_target_ar → usa effect.value para modificar AR/base_ar', () => {
    const defender = makeKnight({ id: 'defender', player: 2, ar: 5 });
    defender.base_ar = 5;

    applyTechniqueSemanticEffect({
      ...makeBaseCtx({ defenderCard: defender }),
      effect: makeEffect('ta_modify_target_ar', { value: -4 }),
    });

    expect(defender.ar).toBe(1);
    expect(defender.base_ar).toBe(1);
  });

  test('ta_modify_target_ce → usa effect.value para modificar CE/base_ce', () => {
    const defender = makeKnight({ id: 'defender', player: 2, ce: 6 });
    defender.base_ce = 6;

    applyTechniqueSemanticEffect({
      ...makeBaseCtx({ defenderCard: defender }),
      effect: makeEffect('ta_modify_target_ce', { value: -2 }),
    });

    expect(defender.ce).toBe(4);
    expect(defender.base_ce).toBe(4);
  });

  test('ta_extra_damage_3 → reduce life del defenderPlayer en 3', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.life = 10;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_extra_damage_3'),
    });

    expect(ctx.defenderPlayer.life).toBe(7);
  });

  test('ta_extra_damage_3 → life no baja de 0', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.life = 1;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_extra_damage_3'),
    });

    expect(ctx.defenderPlayer.life).toBe(0);
  });

  test('ta_extra_damage → usa effect.value para daño extra al jugador', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.life = 10;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_extra_damage', { value: 4 }),
    });

    expect(ctx.defenderPlayer.life).toBe(6);
  });

  test('ta_destroy_assistant → elimina el helper del jugador defensor', () => {
    const ctx = makeBaseCtx();
    const helper = makeKnight({ id: 'helper', player: 2 });
    ctx.defenderPlayer.field_helper = helper;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_destroy_assistant'),
    });

    expect(ctx.defenderPlayer.field_helper).toBeNull();
  });

  test('ta_drain_cosmos_2 → reduce cosmos del jugador defensor en 2', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.cosmos = 5;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_drain_cosmos_2'),
    });

    expect(ctx.defenderPlayer.cosmos).toBe(3);
  });

  test('ta_drain_cosmos_2 → cosmos no baja de 0', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.cosmos = 1;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_drain_cosmos_2'),
    });

    expect(ctx.defenderPlayer.cosmos).toBe(0);
  });

  test('ta_modify_defender_cosmos → usa effect.value para drenar cosmos', () => {
    const ctx = makeBaseCtx();
    ctx.defenderPlayer.cosmos = 5;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_modify_defender_cosmos', { value: -3 }),
    });

    expect(ctx.defenderPlayer.cosmos).toBe(2);
  });

  test('ta_immune_negative → aplica immune_negative al caballero atacante', () => {
    const ctx = makeBaseCtx();
    const knight = ctx.knight;

    applyTechniqueSemanticEffect({
      ...ctx,
      effect: makeEffect('ta_immune_negative'),
    });

    const immuneEffect = knight.status_effects.find(e => e.type === 'immune_negative');
    expect(immuneEffect).toBeDefined();
    expect(immuneEffect?.remaining_turns).toBe(1);
  });

  test('tipo sin handler registrado → no lanza error', () => {
    const ctx = makeBaseCtx();
    expect(() =>
      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeEffect('some_unknown_effect' as StatusEffectType),
      })
    ).not.toThrow();
  });

  // ─── ta_combo ─────────────────────────────────────────────────────────────

  describe('ta_combo', () => {
    function makeComboEffect(actions: TaComboAction[]): StatusEffect {
      return { type: 'ta_combo', remaining_turns: null, params: { actions } };
    }

    test('extra_damage + modify_target_ar + apply_status al mismo tiempo', () => {
      const ctx = makeBaseCtx();
      ctx.defenderPlayer.life = 12;
      const defender = ctx.defenderCard!;
      defender.ar = 5;
      defender.base_ar = 5;
      const statuses: StatusEffectType[] = [];

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([
          { action: 'extra_damage', value: 3 },
          { action: 'modify_target_ar', value: -2 },
          { action: 'apply_status', status_types: ['paralyzed'] },
        ]),
        applyStatusToDefender: (s) => statuses.push(s),
      });

      expect(ctx.defenderPlayer.life).toBe(9);
      expect(defender.ar).toBe(3);
      expect(defender.base_ar).toBe(3);
      expect(statuses).toContain('paralyzed');
    });

    test('las sub-acciones se ejecutan en orden', () => {
      const ctx = makeBaseCtx();
      ctx.defenderPlayer.life = 5;

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([
          { action: 'extra_damage', value: 2 },
          { action: 'extra_damage', value: 2 },
        ]),
      });

      expect(ctx.defenderPlayer.life).toBe(1);
    });

    test('modify_defender_cosmos negativo drena; positivo recarga', () => {
      const ctx = makeBaseCtx();
      ctx.defenderPlayer.cosmos = 4;

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([{ action: 'modify_defender_cosmos', value: -3 }]),
      });

      expect(ctx.defenderPlayer.cosmos).toBe(1);
    });

    test('drain_target_cosmos pone current_cosmos del defensor en 0', () => {
      const ctx = makeBaseCtx();
      ctx.defenderCard!.current_cosmos = 7;

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([{ action: 'drain_target_cosmos' }]),
      });

      expect(ctx.defenderCard!.current_cosmos).toBe(0);
    });

    test('grant_immune_negative aplica immune_negative al caballero atacante', () => {
      const ctx = makeBaseCtx();

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([{ action: 'grant_immune_negative' }]),
      });

      expect(ctx.knight.status_effects.find(e => e.type === 'immune_negative')).toBeDefined();
    });

    test('destroy_assistant elimina el helper del oponente', () => {
      const ctx = makeBaseCtx();
      ctx.defenderPlayer.field_helper = makeKnight({ id: 'helper', player: 2 });

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([{ action: 'destroy_assistant' }]),
      });

      expect(ctx.defenderPlayer.field_helper).toBeNull();
    });

    test('acciones sin defenderCard no crashean (null safety)', () => {
      const ctx = makeBaseCtx({ defenderCard: null });

      expect(() =>
        applyTechniqueSemanticEffect({
          ...ctx,
          effect: makeComboEffect([
            { action: 'modify_target_ar', value: -2 },
            { action: 'extra_damage', value: 3 },
          ]),
        })
      ).not.toThrow();
    });

    test('actions vacío no hace nada', () => {
      const ctx = makeBaseCtx();
      ctx.defenderPlayer.life = 10;

      applyTechniqueSemanticEffect({
        ...ctx,
        effect: makeComboEffect([]),
      });

      expect(ctx.defenderPlayer.life).toBe(10);
    });
  });
});
