-- 016: sobres v2 (domain/packs) y rareza "uncommon" (Poco común).
--
-- • El enum de cards.rarity gana 'uncommon' entre 'common' y 'rare' (6 rarezas).
-- • El enum de user_transactions.reason gana 'PACK_REFUND' (devolución de sobres retirados).
--   El nombre del tipo depende de cómo se creó la BD (schema.sql: card_rarity_enum /
--   transaction_reason_enum; sequelize.sync: enum_cards_rarity / enum_user_transactions_reason),
--   así que se busca el tipo real de cada columna.
-- • packs: cada sobre se identifica por `code` y define su contenido por colecciones
--   (cards.collection_id: santuario, poseidon, omega, black_saints). `coming_soon` lo muestra
--   en la tienda bloqueado ("Próximamente"). `pity_threshold`: cada cuántos sobres seguidos sin
--   épica o superior se garantiza una.
-- • user_pack_pity: sobres abiertos seguidos sin épica o superior, por jugador y sobre.
--
-- Requiere PostgreSQL 12+ (ALTER TYPE ... ADD VALUE dentro de un bloque DO).
DO $$
DECLARE enum_type text;
BEGIN
  SELECT udt_name INTO enum_type FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'cards' AND column_name = 'rarity';
  IF enum_type IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L BEFORE %L', enum_type, 'uncommon', 'rare');
  END IF;

  SELECT udt_name INTO enum_type FROM information_schema.columns
   WHERE table_schema = current_schema() AND table_name = 'user_transactions' AND column_name = 'reason';
  IF enum_type IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_type, 'PACK_REFUND');
  END IF;
END $$;

ALTER TABLE packs ADD COLUMN IF NOT EXISTS code VARCHAR(50);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS collections TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE packs ADD COLUMN IF NOT EXISTS coming_soon BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE packs ADD COLUMN IF NOT EXISTS pity_threshold INTEGER NOT NULL DEFAULT 10 CHECK (pity_threshold >= 1);
ALTER TABLE packs ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS idx_packs_code ON packs(code);

CREATE TABLE IF NOT EXISTS user_pack_pity (
    user_id            UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id            UUID        NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    packs_without_epic INTEGER     NOT NULL DEFAULT 0 CHECK (packs_without_epic >= 0),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, pack_id)
);
