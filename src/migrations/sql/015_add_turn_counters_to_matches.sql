-- 015: matches.turn_counters guarda los contadores por turno de cada jugador.
-- Lo usa la regla de un caballero por turno (domain/game/rules/knight-play.rules.ts):
--   { "player1": { "knights_played": 0, "extra_knight_plays": 0 }, "player2": { ... } }
-- Se pone a cero al cambiar de turno. Las partidas existentes empiezan sin contadores ({}).
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS turn_counters JSONB NOT NULL DEFAULT '{}'::jsonb;
