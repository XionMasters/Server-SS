import { buildRecentMatches, computeMatchStats, FinishedMatchRow } from '../../src/app/profile/profile-stats';

const ME = 'me';
let n = 0;
const match = (winner: string | null, opts: Partial<FinishedMatchRow> = {}): FinishedMatchRow => {
  n++;
  return {
    id: `m${n}`,
    player1_id: ME,
    player2_id: 'rival',
    winner_id: winner,
    finished_at: new Date(Date.UTC(2026, 0, n)),
    player1_name: 'Seiya',
    player2_name: 'Ikki',
    ...opts,
  };
};

describe('computeMatchStats', () => {
  test('counts wins and losses and excludes practice matches', () => {
    const matches = [
      match(ME),
      match('rival'),
      match(ME),
      match(ME, { player2_id: ME }), // TEST: contra sí mismo
    ];
    const stats = computeMatchStats(matches, ME);

    expect(stats).toMatchObject({ wins: 2, losses: 1, total_matches: 3, practice_matches: 1 });
    expect(stats.win_rate).toBeCloseTo(2 / 3);
  });

  test('ignores finished matches without a winner', () => {
    expect(computeMatchStats([match(null)], ME)).toMatchObject({ total_matches: 0, win_rate: 0 });
  });

  test('counts the user as player 2 too', () => {
    const asP2 = match(ME, { player1_id: 'rival', player2_id: ME });
    expect(computeMatchStats([asP2], ME)).toMatchObject({ wins: 1, losses: 0 });
  });

  test('computes current and best streaks in chronological order', () => {
    // Cronológico: W W W L W W
    const matches = [match(ME), match(ME), match(ME), match('rival'), match(ME), match(ME)];
    const stats = computeMatchStats(matches, ME);

    expect(stats.current_streak).toBe(2);
    expect(stats.best_win_streak).toBe(3);
  });

  test('negative streak after consecutive losses', () => {
    const stats = computeMatchStats([match(ME), match('rival'), match('rival')], ME);
    expect(stats.current_streak).toBe(-2);
  });
});

describe('buildRecentMatches', () => {
  test('returns the most recent first, with opponent and result', () => {
    const older = match('rival');
    const newer = match(ME, { player1_id: 'rival', player2_id: ME, player1_name: 'Shiryu', player2_name: 'Seiya' });
    const practice = match(ME, { player2_id: ME });

    const recent = buildRecentMatches([older, newer, practice], ME, 2);

    expect(recent).toEqual([
      { match_id: practice.id, result: 'practice', opponent: null, finished_at: expect.any(String) },
      { match_id: newer.id, result: 'win', opponent: 'Shiryu', finished_at: expect.any(String) },
    ]);
  });
});
