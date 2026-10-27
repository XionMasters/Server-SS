-- Clave estable de cada habilidad (la usa el motor y el panel admin).
-- Sin esta columna, GET /api/cards?include_abilities=true devuelve 500.
ALTER TABLE card_abilities
  ADD COLUMN IF NOT EXISTS ability_key VARCHAR(100) DEFAULT NULL;

-- Rellenar desde el nombre: minúsculas, sin acentos, no alfanuméricos → _
UPDATE card_abilities
SET ability_key = regexp_replace(
  lower(translate(
    name,
    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙãõÃÕ',
    'aeiouunAEIOUUNaeiouAEIOUaoAO'
  )),
  '[^a-z0-9]+', '_', 'g'
)
WHERE ability_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_card_abilities_key
  ON card_abilities (card_id, ability_key);
