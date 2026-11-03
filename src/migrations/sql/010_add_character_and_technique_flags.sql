-- Personaje de la carta: `unique` impide tener en el campo dos cartas del mismo personaje
-- (Kanon v1 y Kanon v2 comparten 'kanon'). Se rellena con npm run seed:cards.
ALTER TABLE cards ADD COLUMN IF NOT EXISTS character VARCHAR(64) DEFAULT NULL;

-- Técnicas: golpear a todos los rivales e ignorar el Modo Defensa.
-- card_techniques la crea sequelize.sync(); en producción puede no existir aún.
DO $$
BEGIN
  IF to_regclass('public.card_techniques') IS NOT NULL THEN
    ALTER TABLE card_techniques ADD COLUMN IF NOT EXISTS target_all BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE card_techniques ADD COLUMN IF NOT EXISTS ignore_defense_mode BOOLEAN NOT NULL DEFAULT FALSE;
  END IF;
END $$;
