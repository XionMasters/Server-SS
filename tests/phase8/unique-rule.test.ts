/**
 * Cartas únicas: un jugador no puede tener en su campo dos caballeros del mismo personaje
 * si alguno es único (rules/unique.rules). El mazo lo limita max_copies, no unique.
 */
import { createEmptyGameState, type CardInGameState } from '../../src/domain/game/GameState';
import { CardRulesEngine } from '../../src/domain/game/CardRulesEngine';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { summonKnight } from '../../src/domain/game/actions/SummonAction';
import { findUniqueConflict } from '../../src/domain/game/rules/unique.rules';

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
    ce: 3,
    ar: 1,
    current_health: 5,
    max_health: 5,
    current_cosmos: 4,
    base_ce: 3,
    base_ar: 1,
    ...params,
  };
}

const kanonV1 = (id: string, params: Partial<CardInGameState> = {}) =>
  card(id, { card_code: 'kanon_seadragon_v1', character: 'kanon', unique: true, ...params });
const kanonV2 = (id: string, params: Partial<CardInGameState> = {}) =>
  card(id, { card_code: 'kanon_seadragon_v2', character: 'kanon', unique: true, ...params });

describe('findUniqueConflict', () => {
  test('dos versiones del mismo personaje chocan', () => {
    expect(findUniqueConflict([kanonV1('k1')], kanonV2('k2'))?.instance_id).toBe('k1');
  });

  test('copias de una carta no única conviven (Sombras del Fénix)', () => {
    const shadow = (id: string) => card(id, { card_code: 'phoenix_shadow', unique: false });
    expect(findUniqueConflict([shadow('s1')], shadow('s2'))).toBeUndefined();
  });

  test('sin character, la identidad es el card_code', () => {
    const solo = (id: string) => card(id, { card_code: 'algo_unico', unique: true });
    expect(findUniqueConflict([solo('u1')], solo('u2'))).toBeDefined();
    expect(findUniqueConflict([solo('u1')], card('x', { unique: true }))).toBeUndefined();
  });
});

describe('Regla de unicidad en el motor', () => {
  function stateWithKanonOnField() {
    const state = createEmptyGameState('unique');
    state.player1.cosmos = 10;
    state.player1.field_knights.push(kanonV1('k1'));
    state.player1.hand.push(kanonV2('k2', { zone: 'hand' }));
    return state;
  }

  test('no se puede jugar Kanon v2 con Kanon v1 en el campo propio', () => {
    const v = CardRulesEngine.validatePlayCard(stateWithKanonOnField(), 1, 'k2', 'field_knight', 1, 3, 1, false);
    expect(v.valid).toBe(false);
  });

  test('el Kanon del rival no impide jugar el propio', () => {
    const state = stateWithKanonOnField();
    state.player1.field_knights = [];
    state.player2.field_knights.push(kanonV1('enemy', { player_number: 2 }));
    expect(CardRulesEngine.validatePlayCard(state, 1, 'k2', 'field_knight', 1, 3, 0, false).valid).toBe(true);
  });

  test('una invocación desde el mazo se cancela y la carta vuelve a su zona', () => {
    const state = createEmptyGameState('unique-summon');
    state.player1.deck_count = 10;
    state.player1.field_knights.push(kanonV1('k1'));
    state.player1.passive_watchers.push(kanonV2('k2', { zone: 'deck' }));

    const ctx = createEngineContext(state);
    summonKnight(ctx, 'k2', 1, 'deck');

    expect(ctx.state.player1.field_knights.map(c => c.instance_id)).toEqual(['k1']);
    expect(ctx.state.player1.passive_watchers.map(c => c.instance_id)).toEqual(['k2']);
    expect(ctx.state.player1.deck_count).toBe(10);
  });
});
