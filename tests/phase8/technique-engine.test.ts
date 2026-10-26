/**
 * technique-engine.test.ts
 *
 * Tests unitarios para TechniqueRulesEngine.
 * Verifican: cálculo de daño, ignore_ar, ta_effects, multi-hit, Modo Defensa.
 */

import { TechniqueRulesEngine, TechniqueStats } from '../../src/engine/TechniqueRulesEngine';
import { createEmptyGameState, type CardInGameState } from '../../src/engine/GameState';
import type { StatusEffect } from '../../src/engine/StatusEffects';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKnight(params: {
  id: string;
  player: 1 | 2;
  ce?: number;
  ar?: number;
  hp?: number;
  cosmos?: number;
  mode?: 'normal' | 'defense' | 'evasion';
  tags?: string[];
  effects?: StatusEffect[];
}): CardInGameState {
  const ce = params.ce ?? 5;
  const ar = params.ar ?? 2;
  const hp = params.hp ?? 10;
  return {
    instance_id: params.id,
    card_id: `card-${params.id}`,
    card_type: 'knight',
    player_number: params.player,
    zone: 'field_knight',
    position: 0,
    mode: params.mode ?? 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: params.effects ?? [],
    card_code: `code-${params.id}`,
    tags: params.tags ?? [],
    raw_abilities: [],
    ce,
    ar,
    current_health: hp,
    max_health: hp,
    current_cosmos: params.cosmos ?? 12,
    base_ce: ce,
    base_ar: ar,
  };
}

function makeTechnique(id: string, player: 1 | 2): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'technique',
    player_number: player,
    zone: 'field_technique',
    position: 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: [],
    card_code: `code-${id}`,
    tags: [],
    raw_abilities: [],
    ce: 0,
    ar: 0,
    current_health: 1,
    max_health: 1,
    current_cosmos: 0,
    base_ce: 0,
    base_ar: 0,
  };
}

function makeBaseStats(overrides?: Partial<TechniqueStats>): TechniqueStats {
  return {
    hit_count: 1,
    hit_ce: 6,
    ta_cost: 3,
    compatible_tags: ['dragon'],
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

function setupTa(params: {
  stats?: Partial<TechniqueStats>;
  attackerTags?: string[];
  defenderAr?: number;
  defenderMode?: 'normal' | 'defense' | 'evasion';
  defenderCosmos?: number;
}): {
  knight: CardInGameState;
  technique: CardInGameState;
  defender: CardInGameState;
  stats: TechniqueStats;
  state: ReturnType<typeof createEmptyGameState>;
} {
  const state = createEmptyGameState('ta-test');
  state.phase = 'player1_turn';
  state.current_player = 1;

  const knight = makeKnight({
    id: 'atk',
    player: 1,
    tags: params.attackerTags ?? ['dragon'],
    cosmos: 12,
  });
  const technique = makeTechnique('tech', 1);
  const defender = makeKnight({
    id: 'def',
    player: 2,
    ar: params.defenderAr ?? 2,
    mode: params.defenderMode ?? 'normal',
    hp: 20,
  });

  state.player1.field_knights.push(knight);
  state.player1.field_techniques.push(technique);
  state.player2.field_knights.push(defender);

  const stats = makeBaseStats(params.stats);
  return { knight, technique, defender, stats, state };
}

// ─── Validate ─────────────────────────────────────────────────────────────────

describe('TechniqueRulesEngine.validateTechniqueAttack', () => {
  test('válido cuando todos los requisitos se cumplen', () => {
    const { state, stats } = setupTa({});
    const result = TechniqueRulesEngine.validateTechniqueAttack(
      state, 1, 'atk', 'tech', 'def', stats,
    );
    expect(result.valid).toBe(true);
  });

  test('falla si el caballero no tiene los tags compatibles', () => {
    const { state, stats } = setupTa({ attackerTags: ['pegasus'] }); // técnica requiere 'dragon'
    const result = TechniqueRulesEngine.validateTechniqueAttack(
      state, 1, 'atk', 'tech', 'def', stats,
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('compatible');
  });

  test('falla si el caballero no tiene cosmos suficiente', () => {
    const state = createEmptyGameState('ta-cosmos');
    state.phase = 'player1_turn';
    state.current_player = 1;
    const knight = makeKnight({ id: 'atk', player: 1, tags: ['dragon'], cosmos: 2 });
    const tech = makeTechnique('tech', 1);
    const def = makeKnight({ id: 'def', player: 2 });
    state.player1.field_knights.push(knight);
    state.player1.field_techniques.push(tech);
    state.player2.field_knights.push(def);

    const result = TechniqueRulesEngine.validateTechniqueAttack(
      state, 1, 'atk', 'tech', 'def',
      makeBaseStats({ ta_cost: 5 }),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('cosmos suficiente');
  });
});

// ─── Daño normal ──────────────────────────────────────────────────────────────

describe('TechniqueRulesEngine.techniqueAttack — daño normal', () => {
  test('daño = max(1, hit_ce - ar) × hit_count', () => {
    const { state, stats } = setupTa({ stats: { hit_ce: 6, hit_count: 1 }, defenderAr: 2 });
    // daño esperado: 6 - 2 = 4
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(4);
  });

  test('multi-hit: daño = (hit_ce - ar) × hit_count', () => {
    const { state, stats } = setupTa({ stats: { hit_ce: 4, hit_count: 3 }, defenderAr: 1 });
    // cada hit: 4 - 1 = 3 → total: 9
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(9);
  });

  test('daño nunca es menor que 1 por hit en modo normal', () => {
    // hit_ce=2, ar=5 → max(1, 2-5) = 1
    const { state, stats } = setupTa({ stats: { hit_ce: 2, hit_count: 1 }, defenderAr: 5 });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(1);
  });

  test('Modo Defensa del defensor reduce daño a floor(hit_ce/2) - ar', () => {
    // hit_ce=6, ar=1, modo defensa → floor(6/2)=3 → 3-1=2
    const { state, stats } = setupTa({
      stats: { hit_ce: 6, hit_count: 1 },
      defenderAr: 1,
      defenderMode: 'defense',
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(2);
  });

  test('Modo Evasión del defensor NO aplica a TA (daño normal)', () => {
    // hit_ce=6, ar=2, modo evasión → igual que normal → 6-2=4
    const { state, stats } = setupTa({
      stats: { hit_ce: 6, hit_count: 1 },
      defenderAr: 2,
      defenderMode: 'evasion',
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(4);
  });
});

// ─── ignore_ar ────────────────────────────────────────────────────────────────

describe('TechniqueRulesEngine — ignore_ar', () => {
  test('ignore_ar: daño = hit_ce (ignora ar del defensor)', () => {
    const { state, stats } = setupTa({
      stats: { hit_ce: 10, hit_count: 1, ignore_ar: true },
      defenderAr: 5, // sería ignorado
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(10);
  });

  test('ignore_ar: también ignora reducción de Modo Defensa', () => {
    const { state, stats } = setupTa({
      stats: { hit_ce: 10, hit_count: 1, ignore_ar: true },
      defenderAr: 3,
      defenderMode: 'defense', // normalmente reduciría a floor(10/2)=5 → 5-3=2
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    // Sin ignore_ar sería 2, con ignore_ar debe ser 10
    expect(totalDamage).toBe(10);
  });

  test('ignore_ar: hit_ce=0 causa 0 daño (Seki Shiki Meikai Ha placeholder)', () => {
    const { state, stats } = setupTa({
      stats: { hit_count: 0, hit_ce: 0, ignore_ar: false, ta_cost: 3 },
      defenderAr: 5,
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(0);
  });

  test('ignore_ar multi-hit: daño = hit_ce × hit_count', () => {
    const { state, stats } = setupTa({
      stats: { hit_ce: 5, hit_count: 3, ignore_ar: true },
      defenderAr: 4,
    });
    const { totalDamage } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    expect(totalDamage).toBe(15); // 5 × 3
  });
});

// ─── ta_effects ────────────────────────────────────────────────────────────────

describe('TechniqueRulesEngine — ta_effects', () => {
  test('aplica burn al defensor cuando la técnica lo define', () => {
    const { state, stats } = setupTa({
      stats: {
        hit_ce: 4,
        hit_count: 1,
        ta_effects: [{ type: 'burn', value: 2, turns: 3 }],
      },
    });
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    const burnEffect = defender.status_effects.find(e => e.type === 'burn');
    expect(burnEffect).toBeDefined();
    expect(burnEffect!.value).toBe(2);
    expect(burnEffect!.remaining_turns).toBe(3);
  });

  test('aplica poison al defensor', () => {
    const { state, stats } = setupTa({
      stats: {
        hit_ce: 3,
        hit_count: 1,
        ta_effects: [{ type: 'poison', value: 1, turns: 3 }],
      },
    });
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    const poisonEffect = defender.status_effects.find(e => e.type === 'poison');
    expect(poisonEffect).toBeDefined();
    expect(poisonEffect!.value).toBe(1);
  });

  test('aplica múltiples ta_effects en orden', () => {
    const { state, stats } = setupTa({
      stats: {
        hit_ce: 4,
        hit_count: 1,
        ta_effects: [
          { type: 'burn',     value: 2, turns: 3 },
          { type: 'paralyzed',         turns: 1 },
        ],
      },
    });
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(defender.status_effects.find(e => e.type === 'burn')).toBeDefined();
    expect(defender.status_effects.find(e => e.type === 'paralyzed')).toBeDefined();
  });

  test('ta_effects vacío no lanza error', () => {
    const { state, stats } = setupTa({ stats: { ta_effects: [] } });
    expect(() => {
      TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    }).not.toThrow();
  });

  test('sin ta_effects no aplica status al defensor', () => {
    const { state, stats } = setupTa({ stats: {} }); // no ta_effects
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(defender.status_effects).toHaveLength(0);
  });

  test('ta_effects se aplican aunque el defensor esté en Modo Defensa', () => {
    const { state, stats } = setupTa({
      stats: {
        hit_ce: 4,
        hit_count: 1,
        ta_effects: [{ type: 'burn', value: 2, turns: 3 }],
      },
      defenderMode: 'defense',
    });
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const defender = newState.player2.field_knights.find(c => c.instance_id === 'def')!;
    expect(defender.status_effects.find(e => e.type === 'burn')).toBeDefined();
  });
});

// ─── Costo cosmos caballero ────────────────────────────────────────────────────

describe('TechniqueRulesEngine — costo cosmos', () => {
  test('deduce ta_cost del cosmos de la carta caballero', () => {
    const { state, stats, knight } = setupTa({ stats: { ta_cost: 4 } });
    const cosmosAntes = knight.current_cosmos; // 12
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const knightDespues = newState.player1.field_knights.find(c => c.instance_id === 'atk')!;
    expect(knightDespues.current_cosmos).toBe(cosmosAntes - 4);
  });

  test('caballero queda exhausto tras el TA', () => {
    const { state, stats } = setupTa({});
    const { newState } = TechniqueRulesEngine.techniqueAttack(state, 1, 'atk', 'tech', 'def', stats);
    const knight = newState.player1.field_knights.find(c => c.instance_id === 'atk')!;
    expect(knight.is_exhausted).toBe(true);
    expect(knight.attacked_this_turn).toBe(true);
  });
});

// ─── Ataque directo ────────────────────────────────────────────────────────────

describe('TechniqueRulesEngine — ataque directo al jugador', () => {
  test('ataque directo (defenderCardId=null) causa 2 DIP al jugador', () => {
    const state = createEmptyGameState('ta-direct');
    state.phase = 'player1_turn';
    state.current_player = 1;
    const knight = makeKnight({ id: 'atk', player: 1, tags: ['dragon'], cosmos: 12 });
    const tech = makeTechnique('tech', 1);
    state.player1.field_knights.push(knight);
    state.player1.field_techniques.push(tech);
    state.player2.life = 20;

    const stats = makeBaseStats();
    const { newState, totalDamage } = TechniqueRulesEngine.techniqueAttack(
      state, 1, 'atk', 'tech', null, stats,
    );
    expect(newState.player2.life).toBe(18); // 20 - 2 DIP
    expect(totalDamage).toBe(0); // daño a carta = 0, solo DIP
  });
});
