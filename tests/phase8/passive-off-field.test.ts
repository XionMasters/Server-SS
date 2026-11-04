/**
 * Pasivas fuera del campo (passive_watchers: mazo, yomotsu…).
 * Solo reaccionan las habilidades que lo declaran (event_target_is_self o self_in_zone fuera del campo);
 * el resto («al inicio de tu turno…», «cuando muere un aliado…») son del caballero en juego.
 */
import fs from 'fs';
import path from 'path';
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';

const legendary = JSON.parse(fs.readFileSync(
  path.resolve(__dirname, '../../database/Santuario/Knights/legendary.json'), 'utf8',
));
const ikkiV1 = legendary.cards.find((c: any) => c.code === 'ikki_phoenix_v1');

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
    current_cosmos: 1,
    base_ce: 3,
    base_ar: 1,
    ...params,
  };
}

/** Pasiva «al inicio de tu turno, recupera 2 CP» sin declarar zona (como Shaka) */
const turnStartCosmos = [{
  ability_key: 'test_turn_start_cosmos',
  type: 'pasiva',
  effects: { trigger: 'TURN_START', actions: [{ type: 'restore_cosmos', target: 'self', amount: 2 }] },
}] as any;

function baseState(): GameState {
  const state = createEmptyGameState('passive-off-field');
  state.current_player = 1;
  state.phase = 'player1_turn';
  state.player1.deck_count = 10;
  return state;
}

function emit(state: GameState, event: Parameters<typeof createEvent>[0]): GameState {
  const ctx = createEngineContext(state);
  ctx.bus.emit(createEvent(event));
  return ctx.state;
}

describe('Pasivas fuera del campo', () => {
  test('una pasiva de inicio de turno no se dispara con la carta en el mazo', () => {
    const state = baseState();
    state.player1.passive_watchers.push(knight('deck-card', { zone: 'deck', raw_abilities: turnStartCosmos }));

    const after = emit(state, { type: 'TURN_START', playerNumber: 1, origin: 'system', payload: { turn: 2 } });

    expect(after.player1.passive_watchers[0].current_cosmos).toBe(1);
  });

  test('la misma pasiva sí se dispara con la carta en el campo', () => {
    const state = baseState();
    state.player1.field_knights.push(knight('field-card', { raw_abilities: turnStartCosmos }));

    const after = emit(state, { type: 'TURN_START', playerNumber: 1, origin: 'system', payload: { turn: 2 } });

    expect(after.player1.field_knights[0].current_cosmos).toBe(3);
  });

  describe('«Return» de Ikki (self_in_zone: yomotsu)', () => {
    const ikki = (zone: string) => knight('ikki', {
      zone,
      card_code: ikkiV1.code,
      tags: ikkiV1.tags,
      raw_abilities: ikkiV1.abilities,
    });

    function allyDies(state: GameState): GameState {
      return emit(state, {
        type: 'ALLY_DIED', playerNumber: 1, targetCardId: 'fallen', origin: 'system',
        payload: { instanceId: 'fallen', owner: 1 } as any,
      });
    }

    test('vuelve al campo desde el yomotsu cuando muere un aliado', () => {
      const state = baseState();
      // Como en MatchStateMapper: en el yomotsu está en graveyard y además vigila en passive_watchers
      const inYomotsu = ikki('yomotsu');
      state.player1.graveyard.push(inYomotsu);
      state.player1.passive_watchers.push(inYomotsu);

      const after = allyDies(state);

      expect(after.player1.field_knights.map(c => c.instance_id)).toContain('ikki');
    });

    test('no hace nada si está en el mazo', () => {
      const state = baseState();
      state.player1.passive_watchers.push(ikki('deck'));

      const after = allyDies(state);

      expect(after.player1.field_knights).toHaveLength(0);
      expect(after.player1.passive_watchers.map(c => c.instance_id)).toContain('ikki');
    });
  });
});
