import { SeededRNG } from '../../src/domain/game/combat/RNG';
import { shuffleArray } from '../../src/app/decks/deck.rules';
import { MatchStateMapper } from '../../src/app/matches/mappers/MatchStateMapper';

describe('SeededRNG', () => {
  test('produces a reproducible sequence and advances its stored seed', () => {
    const first = new SeededRNG(12345);
    const replay = new SeededRNG(12345);

    expect([first.next(), first.next(), first.next()]).toEqual([
      replay.next(),
      replay.next(),
      replay.next(),
    ]);
    expect(first.getSeed()).toBe(replay.getSeed());
  });

  test('uses injected randomness to make deck shuffles reproducible', () => {
    const firstRng = new SeededRNG(67890);
    const replayRng = new SeededRNG(67890);

    expect(shuffleArray([1, 2, 3, 4, 5], () => firstRng.next())).toEqual(
      shuffleArray([1, 2, 3, 4, 5], () => replayRng.next()),
    );
  });

  test('loads the persisted match seed instead of deriving a public state-based seed', () => {
    const match = {
      id: 'match-1',
      player1_id: 'player-1',
      player2_id: 'player-2',
      player1_life: 12,
      player2_life: 12,
      player1_cosmos: 0,
      player2_cosmos: 0,
      player1_deck_size: 40,
      player2_deck_size: 40,
      current_turn: 1,
      current_player: 1,
      phase: 'player1_turn',
      rng_seed: 314159,
      cards_in_play: [],
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };

    expect(MatchStateMapper.fromMatch(match).rng_seed).toBe(314159);
  });
});
