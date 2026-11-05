-- 013: matches.first_player guarda qué jugador empezó la partida.
-- Lo usa la regla del primer turno (domain/game/rules/opening-turn.rules.ts): quien empieza
-- no puede atacar al jugador rival en su primer turno.
-- Las partidas existentes quedan con 1 (en TEST siempre empieza el jugador 1).
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS first_player SMALLINT NOT NULL DEFAULT 1
  CHECK (first_player IN (1, 2));
