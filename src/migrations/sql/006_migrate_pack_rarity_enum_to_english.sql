-- Migration 006: Migrate pack guaranteed rarity enum values from Spanish to English

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'pack_guaranteed_rarity_enum'::regtype
      AND enumlabel = 'comun'
  ) THEN
    ALTER TYPE pack_guaranteed_rarity_enum RENAME VALUE 'comun' TO 'common';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'pack_guaranteed_rarity_enum'::regtype
      AND enumlabel = 'rara'
  ) THEN
    ALTER TYPE pack_guaranteed_rarity_enum RENAME VALUE 'rara' TO 'rare';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'pack_guaranteed_rarity_enum'::regtype
      AND enumlabel = 'epica'
  ) THEN
    ALTER TYPE pack_guaranteed_rarity_enum RENAME VALUE 'epica' TO 'epic';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'pack_guaranteed_rarity_enum'::regtype
      AND enumlabel = 'legendaria'
  ) THEN
    ALTER TYPE pack_guaranteed_rarity_enum RENAME VALUE 'legendaria' TO 'legendary';
  END IF;
END $$;
