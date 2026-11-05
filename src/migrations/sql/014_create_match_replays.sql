-- 014: repeticiones de partidas.
-- Cada match_update que el servidor envía tras una acción se guarda como un fotograma
-- (JSON comprimido con gzip). Al terminar la partida se conservan solo las repeticiones que
-- están entre las últimas 5 partidas de alguno de sus jugadores (app/replays/replay.service.ts).
-- Idempotente.

CREATE TABLE IF NOT EXISTS match_replays (
    match_id     UUID        PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
    player1_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player2_id   UUID        REFERENCES users(id) ON DELETE CASCADE,
    is_test      BOOLEAN     NOT NULL DEFAULT FALSE,
    frame_count  INTEGER     NOT NULL DEFAULT 0,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_replays_player1 ON match_replays (player1_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_replays_player2 ON match_replays (player2_id, finished_at DESC);

CREATE TABLE IF NOT EXISTS match_replay_frames (
    match_id    UUID        NOT NULL REFERENCES match_replays(match_id) ON DELETE CASCADE,
    seq         INTEGER     NOT NULL,
    data        BYTEA       NOT NULL,  -- JSON del fotograma comprimido con gzip
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (match_id, seq)
);
