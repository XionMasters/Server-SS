-- Persist the server-generated RNG state used by each match.
ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS rng_seed BIGINT;

UPDATE matches
SET rng_seed = hashtext(id::text)
WHERE rng_seed IS NULL;

ALTER TABLE matches
  ALTER COLUMN rng_seed SET DEFAULT 0,
  ALTER COLUMN rng_seed SET NOT NULL;
