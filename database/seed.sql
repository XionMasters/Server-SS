-- =============================================================
-- Caballeros Cósmicos - Seed Data PostgreSQL
-- Pobla: packs, profile_avatars, deck_backs
--        profile_avatars, deck_backs
-- Uso: psql -U <usuario> -d <base_de_datos> -f database/seed.sql
-- =============================================================

-- =============================================================
-- PACKS
-- =============================================================
-- Mismos sobres que src/config/packs.config.ts (npm run generate:packs los mantiene al día)
INSERT INTO packs (code, name, description, price, cards_per_pack, guaranteed_rarity, is_active, image_url, collections, coming_soon, pity_threshold, sort_order)
VALUES
  ('santuario',              'Sobre del Santuario',                         '5 cartas de la saga del Santuario. Cada 10 sobres sin épica, el siguiente trae una asegurada.',                     100, 5, NULL, TRUE, NULL, '{santuario}',              FALSE, 10, 0),
  ('santuario_black_saints', 'Sobre del Santuario y los Caballeros Negros', '5 cartas del Santuario y de los Caballeros Negros. Cada 10 sobres sin épica, el siguiente trae una asegurada.', 150, 5, NULL, TRUE, NULL, '{santuario,black_saints}', FALSE, 10, 1),
  ('poseidon',               'Sobre de Poseidón',                           '5 cartas de la saga de Poseidón. Cada 10 sobres sin épica, el siguiente trae una asegurada.',                      150, 5, NULL, TRUE, NULL, '{poseidon}',               FALSE, 10, 2),
  ('omega',                  'Sobre de Omega',                              '5 cartas de la saga Omega. Próximamente.',                                                                         150, 5, NULL, TRUE, NULL, '{omega}',                  TRUE,  10, 3);

-- =============================================================
-- PROFILE AVATARS
-- =============================================================
INSERT INTO profile_avatars (name, image_url, unlock_type, rarity, is_active)
VALUES
  ('Bronce Cósmico',  'avatars/avatar_1.png', 'default', 'common', TRUE),
  ('Plata Estelar',   'avatars/avatar_2.png', 'default', 'common', TRUE),
  ('Oro Galáctico',   'avatars/avatar_3.png', 'default', 'common', TRUE),
  ('Sombras Sagradas','avatars/avatar_4.png', 'default', 'common', TRUE),
  ('Cosmos Divino',   'avatars/avatar_5.png', 'default', 'common', TRUE);

-- =============================================================
-- DECK BACKS
-- =============================================================
INSERT INTO deck_backs (name, image_url, unlock_type, rarity, is_active)
VALUES
  ('Dorso Clásico',            'deck-backs/classic.png',          'default',     'common',    TRUE),
  ('Arma de Atenea',           'deck-backs/athena_weapon.png',    'seasonal',    'common',    TRUE),
  ('El Santuario',             'deck-backs/sanctuary.png',        'seasonal',    'common',    TRUE),
  ('Caballero del Santuario',  'deck-backs/sanctuary_knight.png', 'seasonal',    'common',    TRUE),
  ('Dorso Celestial',          'deck-backs/celestial.png',        'purchase',    'rare',      TRUE),
  ('Dorso Cósmico',            'deck-backs/cosmic.png',           'achievement', 'epic',      TRUE),
  ('Dorso Legendario Divino',  'deck-backs/divine_legendary.png', 'achievement', 'epic',      TRUE);

-- =============================================================
-- CARDS
-- Las cartas NO se cargan desde aquí. Fuente única: database/**/*.json
--   npm run seed:cards   (scripts/loadFromJson.ts, upsert por code)
-- =============================================================
