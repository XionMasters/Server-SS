/**
 * Baian de Caballo Marino (database/Poseidon): Provocación, "Corrientes del Pacífico"
 * (mover/intercambiar caballeros) y sus técnicas Oleaje Ascendente y Soplo Divino.
 * Usa los datos reales del JSON para detectar regresiones de datos y de motor.
 */
import fs from 'fs';
import path from 'path';
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { AbilityEngine } from '../../src/domain/game/abilities/AbilityEngine';
import { ActionRegistry, type ActionContext, type ActionResult } from '../../src/domain/game/actions/ActionRegistry';
import { AttackRulesEngine } from '../../src/domain/game/AttackRulesEngine';
import { TechniqueRulesEngine, type TechniqueStats } from '../../src/domain/game/TechniqueRulesEngine';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';
import type { StatusEffect } from '../../src/domain/game/StatusEffects';
import { CombatModeResolvers } from '../../src/domain/game/combat/CombatResolvers';
import { SeededRNG } from '../../src/domain/game/combat/RNG';

const readCards = (file: string) =>
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../database/Poseidon', file), 'utf8')).cards;
const generals = readCards('Knight/general.json');
const techniques = readCards('techniques.json');
const baianCard = generals.find((c: any) => c.code === 'baian_seahorse_v1');
const abilityOf = (key: string) => baianCard.abilities.find((a: any) => a.ability_key === key).effects;
const statsOf = (code: string): TechniqueStats => techniques.find((c: any) => c.code === code).technique_stats;

function knight(id: string, player: 1 | 2, position: number, params: Partial<CardInGameState> = {}): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'knight',
    player_number: player,
    zone: 'field_knight',
    position,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: [],
    card_code: `code-${id}`,
    tags: [],
    raw_abilities: [],
    ce: 4,
    ar: 1,
    current_health: 10,
    max_health: 10,
    current_cosmos: 8,
    base_ce: 4,
    base_ar: 1,
    ...params,
  };
}

const TAUNT: StatusEffect = { type: 'taunt', remaining_turns: null };
const DEFENSE: StatusEffect = { type: 'defense', remaining_turns: null };

/** Jugador 1 ataca; Baian (b) está en el campo del jugador 2 junto a otros dos caballeros. */
function boardWithBaian(baianEffects: StatusEffect[] = [TAUNT]): GameState {
  const state = createEmptyGameState('baian');
  state.current_player = 1;
  state.phase = 'player1_turn';
  state.player1.field_knights.push(knight('a1', 1, 0), knight('a2', 1, 1));
  state.player2.field_knights.push(
    knight('b', 2, 0, { card_code: 'baian_seahorse_v1', status_effects: baianEffects }),
    knight('r1', 2, 1),
    knight('r2', 2, 3),
  );
  return state;
}

describe('Baian — Muro de Dios (Provocación)', () => {
  test('al entrar en juego queda con Provocación', () => {
    const state = createEmptyGameState('baian-entry');
    state.player1.field_knights.push(knight('b', 1, 0, { raw_abilities: baianCard.abilities }));
    const ctx = createEngineContext(state);
    ctx.bus.emit(createEvent({
      type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: 'b', origin: 'player',
      payload: { zone: 'field_knight', position: 0 },
    }));
    expect(ctx.state.player1.field_knights[0].status_effects.map(e => e.type)).toContain('taunt');
  });

  test('los BA rivales solo pueden ir contra Baian', () => {
    const state = boardWithBaian();
    expect(AttackRulesEngine.validateAttack(state, 1, 'a1', 'r1').valid).toBe(false);
    expect(AttackRulesEngine.validateAttack(state, 1, 'a1', null).valid).toBe(false);
    expect(AttackRulesEngine.validateAttack(state, 1, 'a1', 'b').valid).toBe(true);
  });

  test('congelado o paralizado deja de provocar', () => {
    const state = boardWithBaian([TAUNT, { type: 'frozen', remaining_turns: 2 }]);
    expect(AttackRulesEngine.validateAttack(state, 1, 'a1', 'r1').valid).toBe(true);
  });

  test('las técnicas no están obligadas por la Provocación', () => {
    const state = boardWithBaian();
    state.player1.field_knights[0].tags = ['seahorse'];
    state.player1.field_techniques.push(knight('t', 1, 0, { card_type: 'technique', zone: 'field_technique' }));
    const stats = statsOf('god_breath');
    expect(TechniqueRulesEngine.validateTechniqueAttack(state, 1, 'a1', 't', 'r1', stats).valid).toBe(true);
  });
});

describe('Baian — Corrientes del Pacífico (mover / intercambiar)', () => {
  const activation: any = { type: 'ACTIVE', playerNumber: 2, sourceCardId: 'b' };

  /** Activa la habilidad (jugador 2), elige `cardId` y luego la posición `slot`. */
  function relocate(cardId: string, slot: number): GameState {
    const state = boardWithBaian();
    state.current_player = 2;
    state.phase = 'player2_turn';
    const { newState } = AbilityEngine.execute(abilityOf('baian_pacific_currents'), state, 2, 'b', activation);

    const pickKnight = newState.pending_selection!;
    expect(pickKnight.zone).toBe('field_any');
    expect(pickKnight.visible_card_ids!.sort()).toEqual(['a1', 'a2', 'b', 'r1', 'r2']);

    const run = (actions: any[], extra: Partial<ActionContext>, current: GameState) => {
      const ctx = createEngineContext(current);
      const result: ActionResult = { state: ctx.state, affectedIds: [], extras: {} };
      ActionRegistry.executeAll(actions, {
        playerNumber: 2, sourceCardId: 'b', event: activation, rng: () => ctx.rng.next(),
        bus: ctx.bus, engineContext: ctx, ...extra,
      }, result);
      return result;
    };

    const afterKnight = run(pickKnight.on_select, { selectedCardId: cardId }, newState);
    const pickSlot = afterKnight.state.pending_selection!;
    expect(pickSlot.zone).toBe('field_slot');
    expect(pickSlot.subject_card_id).toBe(cardId);
    expect(pickSlot.visible_slots).not.toContain(
      [...afterKnight.state.player1.field_knights, ...afterKnight.state.player2.field_knights]
        .find(c => c.instance_id === cardId)!.position,
    );

    return run(pickSlot.on_select, { selectedCardId: cardId, selectedSlot: slot }, afterKnight.state).state;
  }

  const positions = (s: GameState, player: 1 | 2) =>
    Object.fromEntries((player === 1 ? s.player1 : s.player2).field_knights.map(c => [c.instance_id, c.position]));

  test('mueve un caballero rival a una posición libre de su propio campo', () => {
    const after = relocate('a1', 4);
    expect(positions(after, 1)).toEqual({ a1: 4, a2: 1 });
    expect(after.player2.field_knights).toHaveLength(3);
  });

  test('si la posición está ocupada, intercambia los dos caballeros (aliados)', () => {
    const after = relocate('r2', 0);
    expect(positions(after, 2)).toEqual({ b: 3, r1: 1, r2: 0 });
  });

  test('nunca cambia de dueño', () => {
    const after = relocate('a2', 0);
    expect(positions(after, 1)).toEqual({ a1: 1, a2: 0 });
    expect(after.player1.field_knights.every(c => c.player_number === 1)).toBe(true);
  });
});

describe('Pilar del Pacífico Norte', () => {
  const stages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../database/Poseidon/stages.json'), 'utf8')).cards;
  const pillarCard = stages.find((c: any) => c.code === 'north_pacific_pillar');
  const pillar = () => ({
    ...knight('p', 1, 0, {
      card_type: 'stage', zone: 'field_scenario', card_code: 'north_pacific_pillar', raw_abilities: pillarCard.abilities,
    }),
    card_name: pillarCard.name,
    effect: '',
  });
  const hasArmorUnbreakable = (c: CardInGameState) => c.status_effects.some(e => e.type === 'armor_unbreakable');

  test('al inicio del turno cura 1 a generales, marinas y Poseidón, y blinda la armadura de Baian', () => {
    const state = createEmptyGameState('np-pillar');
    state.scenario = pillar();
    state.player1.field_knights.push(
      knight('baian', 1, 0, { tags: ['baian', 'seahorse', 'general'], current_health: 5 }),
      knight('mariner', 1, 1, { tags: ['mariner'], current_health: 5 }),
      knight('god', 1, 2, { tags: ['poseidon'], current_health: 5 }),
      knight('seiya', 1, 3, { tags: ['bronze'], current_health: 5 }),
    );
    const ctx = createEngineContext(state);
    ctx.bus.emit(createEvent({ type: 'TURN_START', playerNumber: 1, origin: 'system', payload: { turn: 3 } }));

    const byId = Object.fromEntries(ctx.state.player1.field_knights.map(c => [c.instance_id, c]));
    expect([byId.baian, byId.mariner, byId.god, byId.seiya].map(c => c.current_health)).toEqual([6, 6, 6, 5]);
    expect(ctx.state.player1.field_knights.filter(hasArmorUnbreakable).map(c => c.instance_id)).toEqual(['baian']);
  });

  test('Baian que entra con el pilar ya activo recibe la armadura irrompible; sin pilar, no', () => {
    const enter = (withPillar: boolean) => {
      const state = createEmptyGameState('np-pillar-entry');
      if (withPillar) state.scenario = pillar();
      state.player1.field_knights.push(knight('b', 1, 0, { card_code: 'baian_seahorse_v1', raw_abilities: baianCard.abilities }));
      const ctx = createEngineContext(state);
      ctx.bus.emit(createEvent({
        type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: 'b', origin: 'player',
        payload: { zone: 'field_knight', position: 0 },
      }));
      return hasArmorUnbreakable(ctx.state.player1.field_knights[0]);
    };
    expect(enter(true)).toBe(true);
    expect(enter(false)).toBe(false);
  });

  test('un BA que ignora la AR no la ignora contra armor_unbreakable', () => {
    const state = createEmptyGameState('np-pillar-ba');
    const attacker = knight('a', 1, 0, { ce: 9, status_effects: [{ type: 'ignore_armor', remaining_turns: null }] });
    const damageTo = (defenderEffects: StatusEffect[]) => CombatModeResolvers.normal(
      { state, attacker, defender: knight('b', 2, 0, { ar: 6, status_effects: defenderEffects }), defenderPlayer: state.player2 },
      new SeededRNG(1),
    ).damageToCard;

    expect(damageTo([])).toBe(9);
    expect(damageTo([{ type: 'armor_unbreakable', remaining_turns: 1 }])).toBe(3);
  });
});

describe('Técnicas de Baian', () => {
  function taState(attackerCosmos = 8) {
    const state = boardWithBaian([]);
    state.player1.field_knights[0].tags = ['seahorse'];
    state.player1.field_knights[0].current_cosmos = attackerCosmos;
    state.player1.field_techniques.push(knight('t', 1, 0, { card_type: 'technique', zone: 'field_technique' }));
    // r1 en Modo Defensa, r2 en Modo Evasión
    state.player2.field_knights[1].status_effects = [DEFENSE];
    state.player2.field_knights[1].mode = 'defense';
    state.player2.field_knights[2].status_effects = [{ type: 'evasion', remaining_turns: null }];
    state.player2.field_knights[2].mode = 'evasion';
    return state;
  }

  test('Oleaje Ascendente golpea a todos los rivales y les quita el modo', () => {
    const stats = statsOf('rising_billows');
    const { newState } = TechniqueRulesEngine.techniqueAttack(taState(), 1, 'a1', 't', null, stats);
    const hp = Object.fromEntries(newState.player2.field_knights.map(c => [c.instance_id, c.current_health]));
    // CE 4 − AR 1 = 3; r1 estaba en Defensa: floor(4/2) − 1 = 1
    expect(hp).toEqual({ b: 7, r1: 9, r2: 7 });
    expect(newState.player2.field_knights.every(c => c.mode === 'normal')).toBe(true);
    expect(newState.player2.field_knights.flatMap(c => c.status_effects.map(e => e.type))).toEqual([]);
    expect(newState.player1.field_knights[0].current_cosmos).toBe(4);
  });

  test('Soplo Divino ignora el Modo Defensa y paraliza durante el próximo turno del objetivo', () => {
    const stats = statsOf('god_breath');
    const { newState } = TechniqueRulesEngine.techniqueAttack(taState(), 1, 'a1', 't', 'r1', stats);
    const r1 = newState.player2.field_knights.find(c => c.instance_id === 'r1')!;
    expect(r1.current_health).toBe(10 - (8 - 1));
    expect(r1.status_effects).toContainEqual(expect.objectContaining({ type: 'paralyzed', remaining_turns: 2 }));
  });
});
