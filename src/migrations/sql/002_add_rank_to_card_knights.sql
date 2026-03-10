/**
 * 002_add_rank_to_card_knights.sql
 *
 * Agrega la columna `rank` a `card_knights`.
 * El rango determina el nivel del caballero (Bronce, Plata, Oro, etc.)
 * y es un atributo de gameplay relevante para efectos de cartas como
 * "El Santuario" (aura que afecta a Steel Saints).
 *
 * Ejecutar con:
 *   psql -U [user] -d [database] -f src/migrations/sql/002_add_rank_to_card_knights.sql
 *
 * Rangos definidos (expandible con nuevas facciones):
 *   Bronze Saint  — Caballeros de Bronce
 *   Steel Saint   — Caballeros de Acero
 *   Silver Saint  — Caballeros de Plata
 *   Gold Saint    — Caballeros de Oro
 *   Sonata Saint  — Caballeros Sonata
 *   Sapuris Saint — Caballeros Sapuris
 *   Black Saint   — Caballeros Negros
 *
 * Futuro (cuando se agreguen):
 *   Specter        — Espectros de Hades
 *   God Warrior    — Guerreros Divinos de Asgard
 */

-- ========================================================================
-- Crear tipo ENUM para rank (permite validación en BD)
-- ========================================================================

DO $$ BEGIN
  CREATE TYPE knight_rank_enum AS ENUM (
    'Bronze Saint',
    'Steel Saint',
    'Silver Saint',
    'Gold Saint',
    'Sonata Saint',
    'Sapuris Saint',
    'Black Saint'
    -- Futuro: 'Specter', 'God Warrior'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ========================================================================
-- Agregar columna rank a card_knights
-- ========================================================================

ALTER TABLE card_knights
  ADD COLUMN IF NOT EXISTS rank knight_rank_enum;

-- ========================================================================
-- Índice para queries de aura/efecto de campo que filtran por rank
-- ========================================================================

CREATE INDEX IF NOT EXISTS idx_card_knights_rank
  ON card_knights(rank);
