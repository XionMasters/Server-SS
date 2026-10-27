// Estadísticas de perfil calculadas a partir de las partidas terminadas.
// Funciones puras: reciben filas ya leídas de la BD.

export interface FinishedMatchRow {
  id: string;
  player1_id: string;
  player2_id: string | null;
  winner_id: string | null;
  finished_at: Date | string | null;
  player1_name?: string | null;
  player2_name?: string | null;
}

export interface MatchStats {
  wins: number;
  losses: number;
  total_matches: number;
  win_rate: number; // 0..1
  practice_matches: number;
  current_streak: number; // >0 racha de victorias, <0 de derrotas
  best_win_streak: number;
}

export interface RecentMatch {
  match_id: string;
  result: 'win' | 'loss' | 'practice';
  opponent: string | null;
  finished_at: string | null;
}

/** Las partidas TEST enfrentan al usuario consigo mismo: no cuentan como victorias ni derrotas. */
export const isPracticeMatch = (m: FinishedMatchRow): boolean => m.player1_id === m.player2_id;

const timeOf = (m: FinishedMatchRow): number => (m.finished_at ? new Date(m.finished_at).getTime() : 0);

/** Ordena de la más reciente a la más antigua. */
const byMostRecent = (a: FinishedMatchRow, b: FinishedMatchRow) => timeOf(b) - timeOf(a);

export function computeMatchStats(matches: FinishedMatchRow[], userId: string): MatchStats {
  const ranked = matches
    .filter((m) => !isPracticeMatch(m) && m.winner_id)
    .sort(byMostRecent);

  const wins = ranked.filter((m) => m.winner_id === userId).length;
  const losses = ranked.length - wins;

  // Racha actual: desde la más reciente mientras el resultado no cambie
  let currentStreak = 0;
  for (const m of ranked) {
    const won = m.winner_id === userId;
    if (currentStreak === 0) currentStreak = won ? 1 : -1;
    else if (won && currentStreak > 0) currentStreak++;
    else if (!won && currentStreak < 0) currentStreak--;
    else break;
  }

  // Mejor racha de victorias en orden cronológico
  let best = 0;
  let run = 0;
  for (const m of [...ranked].reverse()) {
    run = m.winner_id === userId ? run + 1 : 0;
    best = Math.max(best, run);
  }

  return {
    wins,
    losses,
    total_matches: ranked.length,
    win_rate: ranked.length > 0 ? wins / ranked.length : 0,
    practice_matches: matches.filter(isPracticeMatch).length,
    current_streak: currentStreak,
    best_win_streak: best,
  };
}

export function buildRecentMatches(matches: FinishedMatchRow[], userId: string, limit = 5): RecentMatch[] {
  return [...matches].sort(byMostRecent).slice(0, limit).map((m) => {
    const practice = isPracticeMatch(m);
    const isPlayer1 = m.player1_id === userId;
    return {
      match_id: m.id,
      result: practice ? 'practice' : m.winner_id === userId ? 'win' : 'loss',
      opponent: practice ? null : (isPlayer1 ? m.player2_name : m.player1_name) ?? null,
      finished_at: m.finished_at ? new Date(m.finished_at).toISOString() : null,
    };
  });
}
