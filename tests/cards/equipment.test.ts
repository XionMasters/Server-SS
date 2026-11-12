/**
 * Equipamiento de objetos (domain/game/rules/equipment.rules.ts):
 *  - a qué caballeros se puede equipar un objeto (filtro de su selección de campo propio),
 *  - en qué posición de la fila de técnicas/objetos queda,
 *  - que el efecto de entrada se aplique al caballero equipado sin volver a preguntar,
 *  - y que ActionResolver ofrezca esos caballeros al cliente (equip_targets).
 * Usa la Armadura de Sagitario real del JSON (caballero [bronze] aliado: +2 CE, +2 AR).
 */
import fs from 'fs';
import path from 'path';
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { CardRulesEngine } from '../../src/domain/game/CardRulesEngine';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';
import { equipEligibleKnights, releaseEquipment } from '../../src/domain/game/rules/equipment.rules';
import { ActionResolver } from '../../src/app/matches/actions/ActionResolver';
import { killKnight } from '../../src/domain/game/actions/KillAction';
import { ActionRegistry, type ActionResult } from '../../src/domain/game/actions/ActionRegistry';

const objects = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../database/Santuario/objects.json'), 'utf8'),
).cards;
const sagittarius = objects.find((c: any) => c.code === 'sagittarius_cloth');

function card(id: string, params: Partial<CardInGameState> = {}): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'knight',
    player_number: 1,
    zone: 'field_knight',
    position: 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: [],
    card_code: `code-${id}`,
    tags: [],
    raw_abilities: [],
    ce: 4,
    ar: 2,
    current_health: 10,
    max_health: 10,
    current_cosmos: 6,
    base_ce: 4,
    base_ar: 2,
    ...params,
  };
}

const bronze = (id: string, position: number) => card(id, { position, tags: ['bronze'] });
const gold = (id: string, position: number) => card(id, { position, tags: ['gold'] });
const clothInHand = () =>
  card('cloth', { card_type: 'object', zone: 'hand', card_code: 'sagittarius_cloth', raw_abilities: sagittarius.abilities });

function boardWith(knights: CardInGameState[], supportPositions: number[] = []): GameState {
  const state = createEmptyGameState('equip');
  state.current_player = 1;
  state.phase = 'player1_turn';
  state.player1.cosmos = 10;
  state.player1.field_knights.push(...knights);
  state.player1.hand.push(clothInHand());
  for (const p of supportPositions) {
    state.player1.field_techniques.push(card(`t${p}`, { card_type: 'technique', zone: 'field_support', position: p }));
  }
  return state;
}

describe('Equipamiento: caballeros elegibles', () => {
  test('la Armadura de Sagitario solo se equipa a caballeros [bronze]', () => {
    const eligible = equipEligibleKnights(sagittarius.abilities, [bronze('seiya', 0), gold('aiolia', 1)]);
    expect(eligible.map(k => k.instance_id)).toEqual(['seiya']);
  });

  test('un objeto sin selección de campo propio se equipa a cualquier caballero', () => {
    const shield = objects.find((c: any) => c.code === 'medusa_shield');
    const eligible = equipEligibleKnights(shield.abilities, [bronze('seiya', 0), gold('aiolia', 1)]);
    expect(eligible.map(k => k.instance_id)).toEqual(['seiya', 'aiolia']);
  });
});

describe('Equipamiento: resolveEquipTarget', () => {
  test('sin caballero elegido no se puede jugar', () => {
    const r = CardRulesEngine.resolveEquipTarget(boardWith([bronze('seiya', 0)]), 1, 'cloth', undefined);
    expect(r.valid).toBe(false);
  });

  test('un caballero que no cumple el filtro se rechaza', () => {
    const r = CardRulesEngine.resolveEquipTarget(boardWith([gold('aiolia', 1)]), 1, 'cloth', 'aiolia');
    expect(r.valid).toBe(false);
  });

  test('un caballero rival no vale', () => {
    const state = boardWith([bronze('seiya', 0)]);
    state.player2.field_knights.push(card('enemy', { player_number: 2, tags: ['bronze'] }));
    expect(CardRulesEngine.resolveEquipTarget(state, 1, 'cloth', 'enemy').valid).toBe(false);
  });

  test('el objeto queda en la columna del caballero', () => {
    const r = CardRulesEngine.resolveEquipTarget(boardWith([bronze('seiya', 2)]), 1, 'cloth', 'seiya');
    expect(r).toEqual({ valid: true, knightId: 'seiya', supportPosition: 2 });
  });

  test('si su columna está ocupada, va a la primera libre', () => {
    const r = CardRulesEngine.resolveEquipTarget(boardWith([bronze('seiya', 2)], [0, 2]), 1, 'cloth', 'seiya');
    expect(r).toEqual({ valid: true, knightId: 'seiya', supportPosition: 1 });
  });

  test('con la fila de técnicas y objetos llena no se puede equipar', () => {
    const r = CardRulesEngine.resolveEquipTarget(boardWith([bronze('seiya', 2)], [0, 1, 2, 3, 4]), 1, 'cloth', 'seiya');
    expect(r.valid).toBe(false);
  });

  test('usa las habilidades que se le pasan (las de BD) antes que las del estado', () => {
    const state = boardWith([gold('aiolia', 0)]);
    state.player1.hand[0].raw_abilities = [];
    // Con las habilidades reales, Aiolia (gold) no es elegible aunque el estado no las tenga
    expect(CardRulesEngine.resolveEquipTarget(state, 1, 'cloth', 'aiolia', sagittarius.abilities).valid).toBe(false);
  });
});

describe('Equipamiento: efecto de entrada', () => {
  function playCloth(equipTargetId?: string) {
    const state = boardWith([bronze('seiya', 0), bronze('shiryu', 1)]);
    const [cloth] = state.player1.hand.splice(0, 1);
    state.player1.field_techniques.push({ ...cloth, zone: 'field_support', position: 1 });
    const ctx = createEngineContext(state);
    ctx.bus.emit(createEvent({
      type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: 'cloth', origin: 'player',
      payload: { zone: 'field_support', position: 1, ...(equipTargetId ? { equip_target_id: equipTargetId } : {}) },
    }));
    return ctx.state;
  }

  test('se aplica al caballero equipado sin pedir selección', () => {
    const state = playCloth('shiryu');
    const shiryu = state.player1.field_knights.find(k => k.instance_id === 'shiryu')!;
    const seiya = state.player1.field_knights.find(k => k.instance_id === 'seiya')!;
    expect(state.pending_selection).toBeFalsy();
    expect(shiryu.ce).toBe(6);
    expect(seiya.ce).toBe(4);
  });

  test('sin caballero equipado, el efecto pide elegir (comportamiento anterior)', () => {
    const state = playCloth();
    expect(state.pending_selection).toBeTruthy();
  });
});

describe('Equipamiento: liberar al salir el caballero', () => {
  test('los objetos equipados van al yomotsu', () => {
    const state = boardWith([bronze('seiya', 0)], [0]);
    const seiya = state.player1.field_knights[0];
    seiya.attached_cards = ['t0'];
    const released = releaseEquipment(state, seiya);
    expect(released.map(c => c.instance_id)).toEqual(['t0']);
    expect(state.player1.field_techniques).toHaveLength(0);
    expect(state.player1.graveyard.map(c => c.instance_id)).toEqual(['t0']);
    expect(seiya.attached_cards).toEqual([]);
  });

  /** Seiya (con el objeto t0 equipado) y Shiryu en campo. */
  function equippedBoard() {
    const state = boardWith([bronze('seiya', 0), bronze('shiryu', 1)], [0]);
    state.player1.field_knights[0].attached_cards = ['t0'];
    return createEngineContext(state);
  }
  const objectOnField = (s: GameState) => s.player1.field_techniques.some(c => c.instance_id === 't0');
  const objectInYomotsu = (s: GameState) => s.player1.graveyard.some(c => c.instance_id === 't0');

  test.each(['damage', 'sacrifice'] as const)('al morir el caballero (%s) el objeto va al yomotsu', reason => {
    const ctx = equippedBoard();
    killKnight(ctx, 'seiya', undefined, reason);
    expect(objectOnField(ctx.state)).toBe(false);
    expect(objectInYomotsu(ctx.state)).toBe(true);
  });

  test('si el caballero vuelve a la mano, el objeto va al yomotsu', () => {
    const ctx = equippedBoard();
    const result: ActionResult = { state: ctx.state, affectedIds: [], extras: {} };
    ActionRegistry.executeAll([{ type: 'send_to_zone', target: 'selected', destination: 'hand' }], {
      playerNumber: 1, sourceCardId: 'x', selectedCardId: 'seiya',
      event: { type: 'ACTIVE', playerNumber: 1 } as any, rng: () => 0.5, bus: ctx.bus, engineContext: ctx,
    }, result);
    expect(result.state.player1.hand.some(c => c.instance_id === 'seiya')).toBe(true);
    expect(objectOnField(result.state)).toBe(false);
    expect(objectInYomotsu(result.state)).toBe(true);
  });

  test('si muere otro caballero, el objeto sigue en campo', () => {
    const ctx = equippedBoard();
    killKnight(ctx, 'shiryu', undefined, 'damage');
    expect(objectOnField(ctx.state)).toBe(true);
  });
});

describe('Equipamiento: ActionResolver ofrece los caballeros (equip_targets)', () => {
  const serializedKnight = (id: string, position: number, tags: string[]) => ({
    id, player_number: 1, zone: 'field_knight', position,
    base_data: { type: 'knight', code: `code-${id}`, tags },
  });
  const serializedCloth = () => ({
    id: 'cloth', player_number: 1, zone: 'hand', position: 0,
    base_data: { type: 'object', code: 'sagittarius_cloth', cost: 3, tags: [], abilities: sagittarius.abilities },
  });
  const matchState = { current_player: 1, player1_cosmos: 5, player2_cosmos: 0, current_turn: 3, first_player: 1 };

  test('solo los caballeros que cumplen el filtro', () => {
    const cards = ActionResolver.resolve(
      [serializedKnight('seiya', 0, ['bronze']), serializedKnight('aiolia', 1, ['gold']), serializedCloth()],
      matchState,
    );
    const va = cards.find(c => c.id === 'cloth').valid_actions;
    expect(va.can_play).toBe(true);
    expect(va.equip_targets).toEqual(['seiya']);
    expect(va.play_zone).toBe('field_technique');
  });

  test('sin caballeros elegibles el objeto no se puede jugar', () => {
    const cards = ActionResolver.resolve([serializedKnight('aiolia', 1, ['gold']), serializedCloth()], matchState);
    const va = cards.find(c => c.id === 'cloth').valid_actions;
    expect(va.can_play).toBe(false);
    expect(va.equip_targets).toEqual([]);
  });
});
