-- 011_card_types_ranks_and_techniques.sql
--
-- Pone al día una BD creada desde database/schema.sql con lo que usan los modelos
-- y los JSON de database/:
--   - card_type_enum: 'object' y 'occasion' (tipos de los JSON de objetos y ocasiones)
--   - knight_rank_enum: rangos de Poseidón ('Marine General', 'Mariner', 'God')
--   - card_in_play_zone_enum: zonas 'field_occasion' y 'field_scenario' (ocasiones y escenarios)
--   - tabla card_techniques (stats de las técnicas)
--   - matches.pending_selection (selecciones interactivas pendientes)
--
-- Idempotente. Ejecutar después de 002 (crea knight_rank_enum).

ALTER TYPE card_type_enum ADD VALUE IF NOT EXISTS 'object';
ALTER TYPE card_type_enum ADD VALUE IF NOT EXISTS 'occasion';

ALTER TYPE knight_rank_enum ADD VALUE IF NOT EXISTS 'Marine General';
ALTER TYPE knight_rank_enum ADD VALUE IF NOT EXISTS 'Mariner';
ALTER TYPE knight_rank_enum ADD VALUE IF NOT EXISTS 'God';

ALTER TYPE card_in_play_zone_enum ADD VALUE IF NOT EXISTS 'field_occasion';
ALTER TYPE card_in_play_zone_enum ADD VALUE IF NOT EXISTS 'field_scenario';

CREATE TABLE IF NOT EXISTS card_techniques (
    card_id             UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    hit_count           INTEGER  NOT NULL DEFAULT 1,
    hit_ce              INTEGER  NOT NULL DEFAULT 0,
    ta_cost             INTEGER  NOT NULL DEFAULT 0,
    compatible_tags     TEXT[]   NOT NULL DEFAULT '{}',
    ignore_ar           BOOLEAN  NOT NULL DEFAULT FALSE,
    ignore_defense_mode BOOLEAN  NOT NULL DEFAULT FALSE,
    target_all          BOOLEAN  NOT NULL DEFAULT FALSE,
    ta_effects          JSONB    NOT NULL DEFAULT '[]'
);

ALTER TABLE matches ADD COLUMN IF NOT EXISTS pending_selection JSONB DEFAULT NULL;
