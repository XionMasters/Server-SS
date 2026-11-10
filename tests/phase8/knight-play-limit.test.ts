/**
 * Un caballero por turno (rules/knight-play.rules.ts): solo se puede jugar un caballero desde
 * la mano por turno, salvo que una habilidad lo permita con `grant_extra_knight_play`.
 */
import { createEmptyGameState, type CardInGameState, type GameState } from '../../src/domain/game/GameState';
import { CardRulesEngine, type CardBdStats } from '../../src/domain/game/CardRulesEngine';
import { TurnRulesEngine } from '../../src/domain/game/TurnRulesEngine';
import { createEngineContext } from '../../src/domain/game/EngineContext';
import { createEvent } from '../../src/domain/game/events/GameEvents';
import { summonKnight } from '../../src/domain/game/actions/SummonAction';
import { ActionResolver } from '../../src/app/matches/actions/ActionResolver';
import { MatchStateMapper } from '../../src/app/matches/mappers/MatchStateMapper';
import {
  KNIGHT_PLAY_LIMIT_ERROR, knightPlaysLeft, readKnightPlayCounters, toStoredTurnCounters,
} from '../../src/domain/game/rules/knight-play.rules';

function knight(id: string, params: Partial<CardInGameState> = {}): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'knight',
    player_number: 1,
    zone: 'hand',
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
    current_cosmos: 0,
    base_ce: 3,
    base_ar: 1,
    ...params,
  };
}

const KNIGHT_STATS: CardBdStats = { cost: 0, generate: 0, card_type: 'knight', health: 5, attack: 3, defense: 1, cosmos: 0 };

const grantOnEnter = {
  ability_key: 'call_reinforcements',
  type: 'pasiva',
  effects: { trigger: 'CARD_PLAYED', actions: [{ type: 'grant_extra_knight_play', target: 'self' }] },
};

function stateWithHand(...cards: CardInGameState[]): GameState {
  const state = createEmptyGameState('knight-play-limit');
  state.current_player = 1;
  state.phase = 'player1_turn';
  state.player1.cosmos = 10;
  state.player1.hand.push(...cards);
  return state;
}

/** Valida y juega un caballero de la mano, emitiendo CARD_PLAYED como CardManager. */
function playKnight(state: GameState, cardId: string, position: number): { valid: boolean; error?: string; state: GameState } {
  const zoneCount = state.player1.field_knights.length;
  const v = CardRulesEngine.validatePlayCard(state, 1, cardId, 'field_knight', position, 0, zoneCount, false, 'knight');
  if (!v.valid) return { valid: false, error: v.error, state };
  const { newState } = CardRulesEngine.executePlayCard(state, 1, cardId, 'field_knight', position, KNIGHT_STATS);
  const ctx = createEngineContext(newState);
  ctx.bus.emit(createEvent({ type: 'CARD_PLAYED', playerNumber: 1, sourceCardId: cardId }));
  return { valid: true, state: ctx.state };
}

describe('Un caballero por turno', () => {
  test('el segundo caballero del turno se rechaza', () => {
    const first = playKnight(stateWithHand(knight('a'), knight('b')), 'a', 0);
    expect(first.valid).toBe(true);
    expect(first.state.player1.knights_played_this_turn).toBe(1);

    const second = playKnight(first.state, 'b', 1);
    expect(second.valid).toBe(false);
    expect(second.error).toBe(KNIGHT_PLAY_LIMIT_ERROR);
  });

  test('el cupo se renueva en el siguiente turno', () => {
    const first = playKnight(stateWithHand(knight('a'), knight('b')), 'a', 0);
    const { newState: p2Turn } = TurnRulesEngine.endTurn(first.state, 1);
    const { newState: p1Turn } = TurnRulesEngine.endTurn(p2Turn, 2);

    expect(p1Turn.player1.knights_played_this_turn).toBe(0);
    expect(playKnight(p1Turn, 'b', 1).valid).toBe(true);
  });

  test('las cartas que no son caballeros no gastan el cupo', () => {
    const state = stateWithHand(knight('a'), knight('tech', { card_type: 'technique' }));
    const v = CardRulesEngine.validatePlayCard(state, 1, 'tech', 'field_support', 0, 0, 0, false, 'technique');
    expect(v.valid).toBe(true);
    const { newState } = CardRulesEngine.executePlayCard(state, 1, 'tech', 'field_support', 0, { ...KNIGHT_STATS, card_type: 'technique' });
    expect(newState.player1.knights_played_this_turn ?? 0).toBe(0);
    expect(playKnight(newState, 'a', 0).valid).toBe(true);
  });

  test('invocar con una habilidad no cuenta como jugar un caballero', () => {
    const played = playKnight(stateWithHand(knight('a'), knight('b')), 'a', 0);
    played.state.player1.deck_count = 10;
    played.state.player1.passive_watchers.push(knight('summoned', { zone: 'deck' }));

    const ctx = createEngineContext(played.state);
    summonKnight(ctx, 'summoned', 1, 'deck');

    expect(ctx.state.player1.field_knights.map(c => c.instance_id)).toContain('summoned');
    expect(ctx.state.player1.knights_played_this_turn).toBe(1);
  });
});

describe('Habilidad grant_extra_knight_play', () => {
  test('un caballero que al entrar permite jugar otro', () => {
    const state = stateWithHand(knight('caller', { raw_abilities: [grantOnEnter as any] }), knight('b'), knight('c'));

    const first = playKnight(state, 'caller', 0);
    expect(first.state.player1.extra_knight_plays).toBe(1);
    expect(knightPlaysLeft(first.state.player1)).toBe(1);

    const second = playKnight(first.state, 'b', 1);
    expect(second.valid).toBe(true);

    // El permiso era para un caballero más: el tercero ya no entra
    expect(playKnight(second.state, 'c', 2).valid).toBe(false);
  });

  test('el permiso extra caduca al terminar el turno', () => {
    const first = playKnight(stateWithHand(knight('caller', { raw_abilities: [grantOnEnter as any] })), 'caller', 0);
    const { newState } = TurnRulesEngine.endTurn(first.state, 1);
    expect(newState.player1.extra_knight_plays).toBe(0);
    expect(knightPlaysLeft(newState.player1)).toBe(1);
  });
});

describe('Persistencia y valid_actions', () => {
  test('matches.turn_counters ida y vuelta', () => {
    const stored = toStoredTurnCounters(
      { knights_played_this_turn: 1, extra_knight_plays: 2 },
      { knights_played_this_turn: 0, extra_knight_plays: 0 },
    );
    expect(readKnightPlayCounters(stored, 1)).toEqual({ knights_played_this_turn: 1, extra_knight_plays: 2 });
    expect(readKnightPlayCounters(JSON.stringify(stored), 2)).toEqual({ knights_played_this_turn: 0, extra_knight_plays: 0 });
    // Partidas sin la columna o con basura: cupo completo
    expect(readKnightPlayCounters(null, 1)).toEqual({ knights_played_this_turn: 0, extra_knight_plays: 0 });
    expect(readKnightPlayCounters('no-json', 2)).toEqual({ knights_played_this_turn: 0, extra_knight_plays: 0 });
  });

  test('el mapper lee y escribe los contadores', () => {
    const state = MatchStateMapper.fromMatch({
      id: 'm', player1_id: 'u1', player2_id: 'u2', current_turn: 1, current_player: 1, phase: 'player1_turn',
      turn_counters: { player1: { knights_played: 1, extra_knight_plays: 0 } },
    });
    expect(state.player1.knights_played_this_turn).toBe(1);
    expect(state.player2.knights_played_this_turn).toBe(0);
    expect(MatchStateMapper.getUpdatesFromState(state).turn_counters).toEqual({
      player1: { knights_played: 1, extra_knight_plays: 0 },
      player2: { knights_played: 0, extra_knight_plays: 0 },
    });
  });

  test('ActionResolver no ofrece jugar caballeros con el cupo agotado', () => {
    const handKnight = { id: 'h1', player_number: 1, zone: 'hand', position: 0, card: { type: 'knight', cost: 0 } };
    const handTech = { id: 'h2', player_number: 1, zone: 'hand', position: 1, card: { type: 'technique', cost: 0 } };
    const base = { current_player: 1, current_turn: 1, first_player: 1, player1_cosmos: 5, player2_cosmos: 5 };

    const fresh = ActionResolver.resolve([handKnight, handTech], { ...base, turn_counters: {} });
    expect(fresh.find(c => c.id === 'h1').valid_actions.can_play).toBe(true);

    const spent = ActionResolver.resolve([handKnight, handTech], {
      ...base, turn_counters: { player1: { knights_played: 1, extra_knight_plays: 0 } },
    });
    expect(spent.find(c => c.id === 'h1').valid_actions.can_play).toBe(false);
    expect(spent.find(c => c.id === 'h2').valid_actions.can_play).toBe(true);

    const granted = ActionResolver.resolve([handKnight], {
      ...base, turn_counters: { player1: { knights_played: 1, extra_knight_plays: 1 } },
    });
    expect(granted[0].valid_actions.can_play).toBe(true);
  });
});
