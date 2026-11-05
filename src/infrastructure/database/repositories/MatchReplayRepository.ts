/**
 * MatchReplayRepository.ts
 *
 * Persistencia de las repeticiones (tablas match_replays y match_replay_frames, migración 014).
 * Cada fotograma es el JSON de un match_update comprimido con gzip.
 */
import { gzipSync, gunzipSync } from 'zlib';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

/** Una repetición necesita al menos el estado inicial y el final */
export const MIN_REPLAY_FRAMES = 2;

export interface ReplayHeader {
  match_id: string;
  player1_id: string;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  winner_id: string | null;
  is_test: boolean;
  frame_count: number;
  finished_at: Date | null;
}

export class MatchReplayRepository {
  /** Añade un fotograma al final de la repetición (la crea si es el primero). */
  static async appendFrame(matchId: string, frame: unknown): Promise<void> {
    const data = gzipSync(Buffer.from(JSON.stringify(frame), 'utf8'));

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `INSERT INTO match_replays (match_id, player1_id, player2_id, is_test)
         SELECT id, player1_id, player2_id, (player2_id IS NOT NULL AND player1_id = player2_id)
           FROM matches WHERE id = $1
         ON CONFLICT (match_id) DO NOTHING`,
        { bind: [matchId], transaction },
      );
      // Bloquear la cabecera serializa los fotogramas de una misma partida
      const locked = await sequelize.query(
        'SELECT match_id FROM match_replays WHERE match_id = $1 FOR UPDATE',
        { bind: [matchId], type: QueryTypes.SELECT, transaction },
      );
      if (locked.length === 0) return; // la partida no existe

      await sequelize.query(
        `INSERT INTO match_replay_frames (match_id, seq, data)
         SELECT $1, COALESCE(MAX(seq) + 1, 0), $2 FROM match_replay_frames WHERE match_id = $1`,
        { bind: [matchId, data], transaction },
      );
      await sequelize.query(
        'UPDATE match_replays SET frame_count = frame_count + 1 WHERE match_id = $1',
        { bind: [matchId], transaction },
      );
    });
  }

  /** Marca la repetición como terminada (con la fecha de fin de la partida). Devuelve sus jugadores. */
  static async markFinished(matchId: string): Promise<{ player1_id: string; player2_id: string | null } | null> {
    const rows = await sequelize.query<{ player1_id: string; player2_id: string | null }>(
      `UPDATE match_replays r
          SET finished_at = COALESCE(m.finished_at, NOW())
         FROM matches m
        WHERE r.match_id = m.id AND r.match_id = $1
      RETURNING r.player1_id, r.player2_id`,
      { bind: [matchId], type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  /**
   * Borra las repeticiones terminadas de estos usuarios que ya no están entre las últimas `keep`
   * de NINGUNO de sus jugadores (una partida PvP se conserva mientras le interese a alguno).
   * Devuelve cuántas borró.
   */
  static async pruneForUsers(userIds: string[], keep: number): Promise<number> {
    const ids = [...new Set(userIds.filter(Boolean))];
    if (ids.length === 0) return 0;

    const deleted = await sequelize.query(
      `DELETE FROM match_replays r
        WHERE r.finished_at IS NOT NULL
          AND (r.player1_id = ANY($1::uuid[]) OR r.player2_id = ANY($1::uuid[]))
          AND NOT EXISTS (
            SELECT 1
              FROM (
                SELECT x.match_id,
                       ROW_NUMBER() OVER (PARTITION BY x.user_id ORDER BY x.finished_at DESC) AS rn
                  FROM (
                    SELECT DISTINCT r2.match_id, u.user_id, r2.finished_at
                      FROM match_replays r2
                     CROSS JOIN LATERAL (VALUES (r2.player1_id), (r2.player2_id)) AS u(user_id)
                     WHERE r2.finished_at IS NOT NULL AND u.user_id IS NOT NULL
                  ) x
              ) ranked
             WHERE ranked.match_id = r.match_id AND ranked.rn <= $2
          )
      RETURNING r.match_id`,
      { bind: [ids, keep], type: QueryTypes.SELECT },
    );
    return deleted.length;
  }

  /**
   * De estas partidas, cuáles tienen repetición terminada que merezca verse: al menos
   * MIN_REPLAY_FRAMES fotogramas (una partida empezada antes de existir las repeticiones
   * solo tendría el del final).
   */
  static async findAvailable(matchIds: string[]): Promise<Set<string>> {
    if (matchIds.length === 0) return new Set();
    const rows = await sequelize.query<{ match_id: string }>(
      `SELECT match_id FROM match_replays
        WHERE match_id = ANY($1::uuid[]) AND finished_at IS NOT NULL AND frame_count >= ${MIN_REPLAY_FRAMES}`,
      { bind: [matchIds], type: QueryTypes.SELECT },
    );
    return new Set(rows.map(r => r.match_id));
  }

  static async getHeader(matchId: string): Promise<ReplayHeader | null> {
    const rows = await sequelize.query<ReplayHeader>(
      `SELECT r.match_id, r.player1_id, r.player2_id, r.is_test, r.frame_count, r.finished_at,
              m.winner_id, u1.username AS player1_name, u2.username AS player2_name
         FROM match_replays r
         JOIN matches m ON m.id = r.match_id
         LEFT JOIN users u1 ON u1.id = r.player1_id
         LEFT JOIN users u2 ON u2.id = r.player2_id
        WHERE r.match_id = $1`,
      { bind: [matchId], type: QueryTypes.SELECT },
    );
    return rows[0] ?? null;
  }

  /** Fotogramas en orden, ya descomprimidos. */
  static async getFrames(matchId: string): Promise<any[]> {
    const rows = await sequelize.query<{ data: Buffer }>(
      'SELECT data FROM match_replay_frames WHERE match_id = $1 ORDER BY seq ASC',
      { bind: [matchId], type: QueryTypes.SELECT },
    );
    return rows.map(r => JSON.parse(gunzipSync(r.data).toString('utf8')));
  }
}
