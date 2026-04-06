-- Migration 004: Add `deck_cover_card_id` column to decks
-- Run this on existing databases; schema.sql already includes the column for fresh installs.

ALTER TABLE decks
  ADD COLUMN IF NOT EXISTS deck_cover_card_id UUID REFERENCES cards(id) ON DELETE SET NULL;
