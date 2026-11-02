-- =============================================================
-- Caballeros Cósmicos - Seed Data PostgreSQL
-- Pobla: packs, profile_avatars, deck_backs
--        profile_avatars, deck_backs
-- Uso: psql -U <usuario> -d <base_de_datos> -f database/seed.sql
-- =============================================================

-- =============================================================
-- PACKS
-- =============================================================
INSERT INTO packs (name, description, price, cards_per_pack, guaranteed_rarity, is_active, image_url)
VALUES
  ('Sobre Básico',       'Un sobre económico con 3 cartas aleatorias. Ideal para probar suerte sin gastar mucho.',                                                   50,  3,  NULL,          TRUE, '/assets/examples/seiya.png'),
  ('Sobre de Bronce',    'Contiene 5 cartas con énfasis en cartas comunes y raras. Perfecto para comenzar tu colección.',                                             100, 5,  'rare',       TRUE, '/assets/examples/seiya.png'),
  ('Sobre de Plata',     'Contiene 7 cartas con mayor probabilidad de cartas épicas. ¡Una inversión inteligente!',                                                   200, 7,  'epic',       TRUE, '/assets/examples/seiya.png'),
  ('Sobre de Oro',       'El sobre premium con 10 cartas y garantía de al menos 1 carta legendaria. ¡Para verdaderos coleccionistas!',                               400, 10, 'legendary',  TRUE, '/assets/examples/seiya.png'),
  ('Mega Pack',          'El pack definitivo con 15 cartas, garantizando al menos 1 legendaria y 2 épicas. ¡Solo para los más valientes!',                           750, 15, 'legendary',  TRUE, '/assets/examples/seiya.png');

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
