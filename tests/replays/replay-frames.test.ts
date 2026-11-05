import { buildStoredFrame, frameForViewer } from '../../src/app/replays/replayFrames';

const matchData = {
  match_id: 'm1',
  current_player: 2,
  current_turn: 3,
  phase: 'player2_turn',
  player1_life: 10,
  player2_life: 8,
  cards_in_play: [
    { id: 'h1', player_number: 1, zone: 'hand', position: 0, card: { name: 'Seiya' }, valid_actions: { can_play: true } },
    { id: 'h2', player_number: 2, zone: 'hand', position: 0, card: { name: 'Shiryu' }, valid_actions: { can_play: true } },
    { id: 'k1', player_number: 1, zone: 'field_knight', position: 2, card: { name: 'Hyoga' }, valid_actions: { can_attack: true } },
    { id: 'd1', player_number: 1, zone: 'deck', position: 0, card: { name: 'Shun' } },
    { id: 'd2', player_number: 2, zone: 'deck', position: 0, card: { name: 'Ikki' } },
  ],
};

const events = [
  { type: 'ALLY_DREW_CARD', playerNumber: 2, payload: { cardId: 'h2' } },
  { type: 'OPPONENT_DREW_CARD', playerNumber: 2, payload: {} },
  { type: 'DAMAGE_DEALT', playerNumber: 1, payload: { amount: 2 } },
];

describe('buildStoredFrame', () => {
  const frame = buildStoredFrame(matchData, { type: 'end_turn' }, events);

  it('no guarda las cartas del mazo ni las valid_actions', () => {
    expect(frame.cards_in_play.map(c => c.id)).toEqual(['h1', 'h2', 'k1']);
    expect(frame.cards_in_play.some(c => 'valid_actions' in c)).toBe(false);
  });

  it('conserva el estado, la acción y los eventos', () => {
    expect(frame.player1_life).toBe(10);
    expect(frame.current_player).toBe(2);
    expect(frame.last_action).toEqual({ type: 'end_turn' });
    expect(frame.engine_events).toHaveLength(3);
  });

  it('no modifica el matchData original', () => {
    expect(matchData.cards_in_play).toHaveLength(5);
    expect(matchData.cards_in_play[0].valid_actions).toBeDefined();
  });
});

describe('frameForViewer', () => {
  const frame = buildStoredFrame(matchData, null, events);

  it('PvP: el jugador ve su mano y la del rival oculta', () => {
    const forP1 = frameForViewer(frame, 1, false);
    expect(forP1.perspective_player).toBe(1);
    expect(forP1.is_replay).toBe(true);
    const hand1 = forP1.cards_in_play.find((c: any) => c.id === 'h1');
    const hand2 = forP1.cards_in_play.find((c: any) => c.id === 'h2');
    expect(hand1.hidden).toBe(false);
    expect(hand1.card.name).toBe('Seiya');
    expect(hand2.hidden).toBe(true);
    expect(hand2.card).toBeNull();
  });

  it('PvP: los eventos de robo se filtran como en directo', () => {
    const forP1 = frameForViewer(frame, 1, false);
    expect(forP1.engine_events.map((e: any) => e.type)).toEqual(['OPPONENT_DREW_CARD', 'DAMAGE_DEALT']);
    const forP2 = frameForViewer(frame, 2, false);
    expect(forP2.engine_events.map((e: any) => e.type)).toEqual(['ALLY_DREW_CARD', 'DAMAGE_DEALT']);
  });

  it('TEST: la perspectiva es la del jugador activo en ese fotograma', () => {
    const view = frameForViewer(frame, 1, true);
    expect(view.perspective_player).toBe(2);
    expect(view.cards_in_play.find((c: any) => c.id === 'h2').hidden).toBe(false);
    expect(view.cards_in_play.find((c: any) => c.id === 'h1').hidden).toBe(true);
  });
});
