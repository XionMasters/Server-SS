-- 012: cards_in_play.is_defensive_mode guarda el modo como texto ('normal' | 'defense' | 'evasion' | 'prayer').
-- Las BD creadas con un esquema antiguo la tienen como BOOLEAN y MatchRepository.applyState
-- falla al escribir el modo ("sintaxis de entrada no válida para tipo boolean"), con lo que
-- cualquier acción que persista el estado (pasar turno, atacar...) se deshace.
-- Idempotente: solo convierte la columna si sigue siendo BOOLEAN.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'cards_in_play'
       AND column_name = 'is_defensive_mode'
       AND data_type = 'boolean'
  ) THEN
    ALTER TABLE cards_in_play ALTER COLUMN is_defensive_mode DROP DEFAULT;
    ALTER TABLE cards_in_play ALTER COLUMN is_defensive_mode TYPE VARCHAR(20)
      USING (CASE WHEN is_defensive_mode THEN 'defense' ELSE 'normal' END);
    ALTER TABLE cards_in_play ALTER COLUMN is_defensive_mode SET DEFAULT 'normal';
    ALTER TABLE cards_in_play ALTER COLUMN is_defensive_mode SET NOT NULL;
  END IF;
END $$;

-- Filas creadas con el valor booleano antiguo convertido a texto
UPDATE cards_in_play SET is_defensive_mode = 'normal'  WHERE is_defensive_mode = 'false';
UPDATE cards_in_play SET is_defensive_mode = 'defense' WHERE is_defensive_mode = 'true';
