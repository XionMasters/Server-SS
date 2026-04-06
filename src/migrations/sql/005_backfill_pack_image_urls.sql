-- Migration 005: Ensure every pack has an image_url and normalize asset paths
-- Uses an existing placeholder image until final artwork is defined.

UPDATE packs
SET image_url = '/assets/examples/seiya.png'
WHERE image_url IS NULL OR BTRIM(image_url) = '';

UPDATE packs
SET image_url = '/assets/' || LTRIM(image_url, '/')
WHERE image_url IS NOT NULL
  AND BTRIM(image_url) <> ''
  AND image_url NOT LIKE '/assets/%'
  AND image_url NOT LIKE 'http://%'
  AND image_url NOT LIKE 'https://%';