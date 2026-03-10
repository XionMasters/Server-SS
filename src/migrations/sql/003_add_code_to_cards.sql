-- Migration 003: Add `code` column to cards
-- Run this on existing databases; schema.sql already includes the column for fresh installs.

ALTER TABLE cards ADD COLUMN IF NOT EXISTS code VARCHAR(100);

-- Populate existing rows with a slug derived from name so NOT NULL can be set
UPDATE cards SET code = LOWER(REPLACE(REPLACE(name, ' ', '_'), '''', ''))
  WHERE code IS NULL;

-- Ensure uniqueness and enforce NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_code ON cards(code);
ALTER TABLE cards ALTER COLUMN code SET NOT NULL;
