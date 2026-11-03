/**
 * Sombra del Fénix (database/BlackSaints/Knights/black_saints.json):
 * al jugar una, las demás copias del mazo entran al campo; su activa se sacrifica por Ikki.
 * Usa las habilidades reales del JSON para detectar regresiones de datos y de motor.
 */
import fs from 'fs';
import path from 'path';
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';
import { AbilityEngine } from '../../src/domain/game/abilities/AbilityEngine';

const blackSaints = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../database/BlackSaints/Knights/black_saints.json'), 'utf8',
));
const shadowCard = blackSaints.cards.find((c: any) => c.code === 'phoenix_shadow');

function knight(id: string, params: Partial<CardInGameState> = {}): CardInGameState {
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

const shadow = (id: string, zone: string, position = 0) => knight(id, {
  zone,
  position,
  card_code: 'phoenix_shadow',
  tags: shadowCard.tags,
  raw_abilities: shadowCard.abilities,
});

/** Una Sombra recién jugada en la posición 0 y `inDeck` copias en el mazo. */
function stateWithShadows(inDeck: number): GameState {
  const state = createEmptyGameState('phoenix-shadow');
  state.current_player = 1;
  state.phase = 'player1_turn';
  state.player1.deck_count = 10;
  state.player1.field_knights.push(shadow('s0', 'field_knight'));
  for (let i = 1; i <= inDeck; i++) state.player1.passive_watchers.push(shadow(`s${i}`, 'deck'));
  return state;
}

function playShadow(state: GameState) {
  const ctx = createEngineContext(state);
  ctx.bus.emit(createEvent({
    type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: 's0', origin: 'player',
    payload: { zone: 'field_knight', position: 0 },
  }));
  return ctx.state;
}

describe('Sombra del Fénix', () => {
  test('al jugar una, las copias del mazo entran al campo y descuentan el mazo', () => {
    const after = playShadow(stateWithShadows(3));

    expect(after.player1.field_knights.map(c => c.instance_id).sort()).toEqual(['s0', 's1', 's2', 's3']);
    expect(new Set(after.player1.field_knights.map(c => c.position)).size).toBe(4);
    expect(after.player1.passive_watchers).toHaveLength(0);
    expect(after.player1.deck_count).toBe(7);
  });

  test('solo entran las que caben: el resto se queda en el mazo', () => {
    const state = stateWithShadows(3);
    state.player1.field_knights.push(
      knight('a', { position: 1 }), knight('b', { position: 2 }), knight('c', { position: 3 }),
    );

    const after = playShadow(state);
    expect(after.player1.field_knights).toHaveLength(5);
    expect(after.player1.passive_watchers).toHaveLength(2);
    expect(after.player1.deck_count).toBe(9);
  });

  test('Regreso al Fénix potencia a Ikki y la Sombra muere (devolviéndole 1 CP)', () => {
    const state = stateWithShadows(0);
    state.player1.field_knights.push(knight('ikki', { position: 1, tags: ['ikki', 'phoenix'], current_health: 5, max_health: 10 }));
    const returnAbility = shadowCard.abilities.find((a: any) => a.ability_key === 'phoenix_shadow_return').effects;
    const activation: any = { type: 'ACTIVE', playerNumber: 1, sourceCardId: 's0' };

    expect(AbilityEngine.canActivate(returnAbility, state, 1, 's0', activation).valid).toBe(true);
    const { newState } = AbilityEngine.execute(returnAbility, state, 1, 's0', activation);

    const ikki = newState.player1.field_knights.find(c => c.instance_id === 'ikki')!;
    expect(newState.player1.field_knights.some(c => c.instance_id === 's0')).toBe(false);
    expect(ikki.ce).toBe(5);
    expect(ikki.current_health).toBe(7);
    expect(ikki.current_cosmos).toBe(5);
  });

  test('Regreso al Fénix no se puede usar sin un caballero [ikki] en campo', () => {
    const state = stateWithShadows(0);
    const returnAbility = shadowCard.abilities.find((a: any) => a.ability_key === 'phoenix_shadow_return').effects;
    const activation: any = { type: 'ACTIVE', playerNumber: 1, sourceCardId: 's0' };
    expect(AbilityEngine.canActivate(returnAbility, state, 1, 's0', activation).valid).toBe(false);
  });
});
