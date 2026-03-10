-- =============================================================
-- Caballeros Cósmicos - Seed Data PostgreSQL
-- Pobla: cards, card_knights, card_abilities, packs,
--        profile_avatars, deck_backs
-- Uso: psql -U <usuario> -d <base_de_datos> -f database/seed.sql
-- =============================================================

-- =============================================================
-- PACKS
-- =============================================================
INSERT INTO packs (name, description, price, cards_per_pack, guaranteed_rarity, is_active)
VALUES
  ('Sobre Básico',       'Un sobre económico con 3 cartas aleatorias. Ideal para probar suerte sin gastar mucho.',                                                   50,  3,  NULL,          TRUE),
  ('Sobre de Bronce',    'Contiene 5 cartas con énfasis en cartas comunes y raras. Perfecto para comenzar tu colección.',                                             100, 5,  'rara',        TRUE),
  ('Sobre de Plata',     'Contiene 7 cartas con mayor probabilidad de cartas épicas. ¡Una inversión inteligente!',                                                   200, 7,  'epica',       TRUE),
  ('Sobre de Oro',       'El sobre premium con 10 cartas y garantía de al menos 1 carta legendaria. ¡Para verdaderos coleccionistas!',                               400, 10, 'legendaria',  TRUE),
  ('Mega Pack',          'El pack definitivo con 15 cartas, garantizando al menos 1 legendaria y 2 épicas. ¡Solo para los más valientes!',                           750, 15, 'legendaria',  TRUE);

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
-- CARDS  (caballeros, técnicas, objetos, escenarios)
-- Usamos un bloque DO para capturar los IDs generados y
-- poblar las tablas dependientes en el mismo paso.
-- =============================================================
DO $$
DECLARE
  -- Caballeros de Bronce
  v_seiya       UUID;
  v_shiryu      UUID;
  v_hyoga       UUID;
  v_shun        UUID;
  v_ikki        UUID;
  v_jabu        UUID;
  v_geki        UUID;
  v_ban         UUID;
  v_nachi       UUID;
  v_ichi        UUID;
  -- Caballeros de Plata
  v_misty       UUID;
  v_moses       UUID;
  v_asterion    UUID;
  v_babel       UUID;
  v_dante       UUID;
  v_jamian      UUID;
  v_capella     UUID;
  v_algol       UUID;
  -- Caballeros Dorados
  v_mu          UUID;
  v_aldebaran   UUID;
  v_saga        UUID;
  v_deathmasque UUID;
  v_aiolia      UUID;
  v_shaka       UUID;
  v_dohko       UUID;
  v_milo        UUID;
  v_aiolos      UUID;
  v_shura       UUID;
  v_camus       UUID;
  v_afrodita    UUID;
  -- Técnicas
  v_t_meteoros  UUID;
  v_t_shoryu    UUID;
  v_t_polvo     UUID;
  v_t_cadena    UUID;
  v_t_ave       UUID;
  v_t_lightning UUID;
  v_t_galaxy    UUID;
  v_t_excalibur UUID;
  v_t_cosmos    UUID;
  v_t_curacion  UUID;
  v_t_escudo    UUID;
  v_t_ilusion   UUID;
  v_t_telequi   UUID;
  v_t_athena_ex UUID;
  v_t_formacion UUID;
  -- Objetos
  v_o_arm_pegaso UUID;
  v_o_arm_sagit  UUID;
  v_o_armas_libra UUID;
  v_o_escudo_ath  UUID;
  v_o_rosario     UUID;
  v_o_baculo      UUID;
  v_o_cristal     UUID;
  v_o_fragmento   UUID;
  v_o_nectar      UUID;
  v_o_elixir      UUID;
  v_o_pandora     UUID;
  v_o_lira        UUID;
  v_o_polvo_est   UUID;
  v_o_espejo      UUID;
  v_o_pesas       UUID;
  v_o_manual      UUID;
  v_o_sanctuary   UUID;
  -- Escenarios
  v_s_santuario   UUID;
  v_s_aries       UUID;
  v_s_leo         UUID;
  v_s_virgo       UUID;
  v_s_5picos      UUID;
  v_s_bosque      UUID;
  v_s_siberia     UUID;
  v_s_coliseo     UUID;
  v_s_templo      UUID;
  v_s_jardin      UUID;
  v_s_biblioteca  UUID;
  v_s_lago        UUID;
  v_s_tartarus    UUID;
  v_s_dimension   UUID;
  v_s_neutral     UUID;

BEGIN

-- ============================================================
-- CABALLEROS DE BRONCE
-- ============================================================

-- Seiya de Pegaso
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Seiya de Pegaso', 'knight', 'epic', 0, 2, 'El caballero de bronce más determinado, protector de Athena.', 'assets/legendary/34.webp', 'Athena', 'fire')
  RETURNING id INTO v_seiya;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_seiya, 3, 2, 9, 8, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_seiya, 'Justice Fist',
   'activa',
   'Descarta una carta de tu mano; el próximo BA de este caballero ignora la AR del defensor.',
   '{}',
   '{"trigger":"ACTIVE","cost":[{"type":"discard","target":"self_hand","amount":1}],"actions":[{"type":"apply_status","status":"ignore_armor","target":"self"}]}'),
  (v_seiya, 'Inner Determination',
   'pasiva',
   'Si este caballero recibe un golpe letal, permanece en el campo un turno adicional immune a todo daño.',
   '{}',
   '{"trigger":"CARD_PLAYED","actions":[{"type":"apply_status","status":"last_stand","target":"self"}]}');

-- Shiryu de Dragón
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Shiryu de Dragón', 'knight', 'rare', 0,2, 'El caballero más defensivo, maestro del Rozan Shoryu Ha.', 'assets/legendary/35.webp', 'Athena', 'water')
  RETURNING id INTO v_shiryu;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_shiryu, 3, 2, 9, 8, TRUE, 0.3, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_shiryu, 'Rozan Shoryu Ha',  'activa', 'Ataque devastador que ignora defensa',           '{"cosmos_min":3}',       '{"ignore_defense":true,"damage":150}'),
  (v_shiryu, 'Escudo del Dragón','pasiva', 'En modo defensivo, refleja 30% del daño',        '{"is_defending":true}',  '{"reflect_damage_percent":30}');

-- Hyoga de Cisne
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Hyoga de Cisne', 'knight', 'rare', 0,2, 'Maestro del hielo, con ataques que congelan al enemigo.', 'assets/legendary/36.webp', 'Athena', 'water')
  RETURNING id INTO v_hyoga;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_hyoga, 3, 2, 9, 8, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_hyoga, 'Polvo de Diamantes', 'activa', 'Congela al enemigo por 1 turno',             '{"cosmos_min":2}', '{"status_effect":"frozen","duration":1,"damage":80}'),
  (v_hyoga, 'Frialdad Absoluta',  'pasiva', 'Inmune a efectos de estado negativos',       '{}',               '{"status_immunity":["poison","burn","confusion"]}');

-- Shun de Andrómeda
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Shun de Andrómeda', 'knight', 'rare', 0,2, 'El más gentil de los caballeros, pero letal con sus cadenas.', 'assets/legendary/37.webp', 'Athena', 'wind')
  RETURNING id INTO v_shun;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_shun, 90, 110, 160, 4, TRUE, 0.4, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_shun, 'Cadena Espiral',     'activa', 'Ata al enemigo, reduciendo su ataque por 2 turnos', '{"cosmos_min":2}', '{"status_effect":"bound","attack_reduction":50,"duration":2}'),
  (v_shun, 'Corazón Bondadoso',  'pasiva', 'Cura 20 HP a todos los aliados al inicio del turno','{}',              '{"heal_allies":20,"trigger":"turn_start"}');

-- Ikki de Fénix
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Ikki de Fénix', 'knight', 'epic', 0, 0,
          'El caballero inmortal del Fénix. Sus llamas arden sin fin y ningún Yomotsu puede retenerlo.',
          'bronzes/ikki.png', 'Athena', 'steel')
  RETURNING id INTO v_ikki;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_ikki, 4, 2, 8, 7, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_ikki, 'Phoenix Flames',
   'activa',
   'Paga 3 CP; lanza una moneda. Si sale cara, inflige condición BRN al caballero objetivo (1 daño/turno durante 3 turnos). Si sale cruz, los CP se pierden igual.',
   '{}',
   '{"trigger":"ACTIVE","cost":[{"type":"cosmos","amount":3}],"actions":[{"type":"coin_flip_then","on_heads":[{"type":"apply_status","status":"burn","target":"target","value":1,"duration":3}]}]}'),
  (v_ikki, 'Return',
   'pasiva',
   'Cuando un caballero aliado muere, Ikki regresa al campo de batalla desde el Yomotsu (si se encuentra allí). Solo puede activarse una vez por turno.',
   '{}',
   '{"trigger":"CARD_PLAYED","actions":[{"type":"apply_status","status":"phoenix_rebirth","target":"self"}]}');

-- Jabu de Unicornio
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Jabu de Unicornio', 'knight', 'rare', 2, 2,
          'Caballero de bronce leal con un cuerno perforador capaz de atravesar cualquier defensa.',
          'bronzes/jabu.png', 'Athena', 'steel')
  RETURNING id INTO v_jabu;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_jabu, 2, 2, 6, 6, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_jabu, 'Match 1',
   'activa',
   'Paga 3 PC; el siguiente AB del portador ignora la armadura del defensor.',
   '{}',
   '{"trigger":"ACTIVE","cost":[{"type":"cosmos","amount":3}],"conditions":[{"type":"no_status","status":"ignore_armor"}],"actions":[{"type":"apply_status","status":"ignore_armor","target":"self"}]}'),
  (v_jabu, 'Cuerno de Unicornio',
   'pasiva',
   'Los AB realizados por el portador causan 1 DIP de Daño Directo adicional al jugador rival.',
   '{}',
   '{"trigger":"CARD_PLAYED","actions":[{"type":"apply_status","status":"unicorn_horn","target":"self"}]}');

-- Geki de Oso
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Geki de Oso', 'knight', 'common', 2, 'Caballero con la fuerza bruta de un oso.', 'Athena')
  RETURNING id INTO v_geki;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_geki, 100, 60, 120, 2, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_geki, 'Abrazo del Oso', 'activa', 'Inmoviliza al enemigo y causa daño continuo', '{"cosmos_min":2}', '{"status_effect":"grappled","damage_per_turn":15,"duration":2}');

-- Ban de León Menor
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Ban de León Menor', 'knight', 'common', 2, 'Caballero ágil con garras afiladas.', 'Athena')
  RETURNING id INTO v_ban;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_ban, 90, 50, 90, 2, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_ban, 'Garra del León', 'activa', 'Ataque que causa sangrado', '{"cosmos_min":1}', '{"status_effect":"bleeding","damage_per_turn":10,"duration":3}');

-- Nachi de Lobo
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Nachi de Lobo', 'knight', 'common', 0, 2,
          'Caballero de bronce ágil e instintivo. Cada golpe directo al rival desencadena el poder de la manada.',
          'bronzes/nachi.png', 'Athena', 'steel')
  RETURNING id INTO v_nachi;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_nachi, 2, 1, 7, 6, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_nachi, 'Match 1',
   'activa',
   'Paga 3 CP; el siguiente AB del portador ignora la armadura del defensor.',
   '{}',
   '{"trigger":"ACTIVE","cost":[{"type":"cosmos","amount":3}],"conditions":[{"type":"no_status","status":"ignore_armor"}],"actions":[{"type":"apply_status","status":"ignore_armor","target":"self"}]}'),
  (v_nachi, 'Efecto Manada',
   'pasiva',
   'Cuando los AB del portador causan DIP directo al jugador rival, causan 1 DIP extra adicional.',
   '{}',
   '{"trigger":"CARD_PLAYED","actions":[{"type":"apply_status","status":"herd_effect","target":"self"}]}');

-- Ichi de Hidra
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Ichi de Hidra', 'knight', 'common', 2, 'Caballero venenoso con múltiples ataques.', 'Athena')
  RETURNING id INTO v_ichi;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_ichi, 70, 65, 110, 3, TRUE, 0.5, 'Bronze Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_ichi, 'Veneno de Hidra', 'activa', 'Envenena al enemigo', '{"cosmos_min":1}', '{"status_effect":"poison","damage_per_turn":12,"duration":4}');

-- ============================================================
-- CABALLEROS DE PLATA
-- ============================================================

-- Misty de Lagarto
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Misty de Lagarto', 'knight', 'rare', 4, 'Caballero de plata maestro de las ilusiones.', 'Athena')
  RETURNING id INTO v_misty;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_misty, 130, 110, 170, 4, TRUE, 0.4, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_misty, 'Mavros Tripas',        'activa', 'Crea ilusiones que confunden al enemigo',    '{"cosmos_min":3}', '{"status_effect":"confusion","duration":2,"dodge_chance":50}'),
  (v_misty, 'Maestro de Ilusiones', 'pasiva', '20% de probabilidad de esquivar ataques',    '{}',               '{"dodge_chance":20}');

-- Moses de Ballena
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Moses de Ballena', 'knight', 'rare', 4, 'Caballero de plata con ataques aplastantes.', 'Athena')
  RETURNING id INTO v_moses;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_moses, 150, 120, 200, 4, TRUE, 0.3, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_moses, 'Kaitos Spouting Bomber', 'activa', 'Ataque devastador con onda expansiva',    '{"cosmos_min":4}', '{"area_damage":true,"damage":120,"knockback":true}'),
  (v_moses, 'Resistencia Marina',     'pasiva', 'Resistente a efectos de estado',          '{}',               '{"status_resistance":70}');

-- Asterion de Sabuesos
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Asterion de Sabuesos', 'knight', 'rare', 4, 'Caballero con instintos de cazador perfectos.', 'Athena')
  RETURNING id INTO v_asterion;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_asterion, 140, 100, 160, 4, TRUE, 0.5, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_asterion, 'Million Ghost Attack', 'activa', 'Ataques múltiples imposibles de esquivar', '{"cosmos_min":3}', '{"multi_hit":5,"damage_per_hit":30,"cannot_dodge":true}'),
  (v_asterion, 'Rastreo Perfecto',     'pasiva', 'Los ataques siempre impactan',             '{}',               '{"accuracy":100}');

-- Babel de Centauro
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Babel de Centauro', 'knight', 'rare', 4, 'Caballero arquero con precisión mortal.', 'Athena')
  RETURNING id INTO v_babel;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_babel, 135, 95, 150, 4, TRUE, 0.5, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_babel, 'Flecha de Sagitario', 'activa', 'Disparo certero que atraviesa defensas', '{"cosmos_min":2}', '{"armor_pierce":80,"critical_chance":30,"damage":100}'),
  (v_babel, 'Puntería Letal',      'pasiva', '25% de probabilidad de golpe crítico',  '{}',               '{"critical_chance":25,"critical_multiplier":2.0}');

-- Dante de Cerbero
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Dante de Cerbero', 'knight', 'epic', 5, 'Guardián infernal con ataques de fuego.', 'Athena')
  RETURNING id INTO v_dante;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_dante, 160, 130, 180, 5, TRUE, 0.3, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_dante, 'Howling Crush',    'activa', 'Ataque sónico que aturde a todos los enemigos', '{"cosmos_min":4}',          '{"area_damage":true,"status_effect":"stunned","duration":1,"damage":90}'),
  (v_dante, 'Guardián Infernal','pasiva', 'Contraataca cuando recibe daño',                '{"damage_received":true}',  '{"counter_attack":true,"counter_damage":50}');

-- Jamian de Cuervo
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Jamian de Cuervo', 'knight', 'rare', 3, 'Caballero siniestro que ataca desde las sombras.', 'Athena')
  RETURNING id INTO v_jamian;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_jamian, 125, 85, 140, 3, TRUE, 0.5, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_jamian, 'Plumas Cortantes', 'activa', 'Múltiples proyectiles que causan sangrado',     '{"cosmos_min":2}',          '{"multi_projectile":6,"status_effect":"bleeding","damage_per_turn":8,"duration":3}'),
  (v_jamian, 'Vuelo Siniestro',  'pasiva', 'Difícil de golpear por enemigos terrestres',    '{"enemy_type":"ground"}',   '{"dodge_bonus":40}');

-- Capella de Auriga
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Capella de Auriga', 'knight', 'rare', 4, 'Caballero protector con defensas impenetrables.', 'Athena')
  RETURNING id INTO v_capella;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_capella, 110, 150, 190, 4, TRUE, 0.2, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_capella, 'Escudo Caprino', 'activa', 'Protege a todos los aliados del próximo ataque',     '{"cosmos_min":3}',          '{"protect_allies":true,"damage_reduction":80,"duration":1}'),
  (v_capella, 'Defensor Nato',  'pasiva', 'Recibe daño dirigido a aliados con menos de 30% vida','{"ally_low_health":30}',   '{"redirect_damage":true,"damage_reduction":30}');

-- Algol de Perseo
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Algol de Perseo', 'knight', 'epic', 5, 'Caballero con el poder petrificante de Medusa.', 'Athena')
  RETURNING id INTO v_algol;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_algol, 145, 115, 165, 5, TRUE, 0.4, 'Silver Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_algol, 'Escudo de Medusa',      'activa', 'Petrifica al enemigo por 2 turnos',                   '{"cosmos_min":4}',          '{"status_effect":"petrified","duration":2,"damage":80}'),
  (v_algol, 'Mirada Petrificante',   'pasiva', '10% de petrificar al atacante cuando recibe daño',    '{"damage_received":true}',  '{"petrify_chance":10,"duration":1}');

-- ============================================================
-- CABALLEROS DORADOS
-- ============================================================

-- Mu de Aries
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Mu de Aries', 'knight', 'legendary', 7, 'Guardián de la primera casa, maestro de la telequinesis.', 'Athena')
  RETURNING id INTO v_mu;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_mu, 170, 140, 220, 7, TRUE, 0.2, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_mu, 'Muro de Cristal',              'activa', 'Barrera que refleja todos los ataques por 2 turnos', '{"cosmos_min":5}', '{"barrier":true,"reflect_damage":true,"duration":2}'),
  (v_mu, 'Reparación Telequinética',     'activa', 'Repara armaduras y cura a todos los aliados',        '{"cosmos_min":4}', '{"heal_all_allies":60,"repair_armor":true}'),
  (v_mu, 'Maestro de Lemuria',           'pasiva', 'Regenera cosmos cada turno',                         '{}',               '{"cosmos_regen":1,"trigger":"turn_start"}');

-- Aldebaran de Tauro
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Aldebaran de Tauro', 'knight', 'legendary', 7, 'El muro más sólido del Santuario, guardián de Tauro.', 'Athena')
  RETURNING id INTO v_aldebaran;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_aldebaran, 200, 180, 280, 6, TRUE, 0.1, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_aldebaran, 'Gran Cuerno',             'activa', 'Ataque devastador que atraviesa múltiples enemigos', '{"cosmos_min":5}', '{"line_attack":true,"armor_pierce":100,"damage":180}'),
  (v_aldebaran, 'Fortaleza Inquebrantable','pasiva',  'Inmune a knockback y efectos de movimiento',        '{}',               '{"knockback_immunity":true,"immobilize_immunity":true}'),
  (v_aldebaran, 'Muro de Tauro',           'pasiva',  'Reduce todo el daño recibido en 20',                '{}',               '{"damage_reduction_flat":20}');

-- Saga de Géminis
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Saga de Géminis', 'knight', 'legendary', 8, 'Ex-Patriarca con poderes dimensionales devastadores.', 'Athena')
  RETURNING id INTO v_saga;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_saga, 190, 120, 200, 8, TRUE, 0.4, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_saga, 'Galaxian Explosion', 'activa', 'Explosión cósmica que arrasa el campo de batalla','{"cosmos_min":7}', '{"area_damage":true,"damage":250,"cosmos_drain":2}'),
  (v_saga, 'Another Dimension',  'activa', 'Destierra a un enemigo a otra dimensión',          '{"cosmos_min":6}', '{"banish":true,"duration":2,"damage":150}'),
  (v_saga, 'Personalidad Dual',  'pasiva', '50% de actuar dos veces por turno',                '{}',               '{"double_action_chance":50}');

-- Máscara de la Muerte de Cáncer
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Máscara de la Muerte de Cáncer', 'knight', 'legendary', 6, 'Guardián siniestro que controla las almas de los muertos.', 'Athena')
  RETURNING id INTO v_deathmasque;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_deathmasque, 160, 130, 190, 6, TRUE, 0.4, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_deathmasque, 'Ondas Infernales',    'activa', 'Invoca almas vengativas que atacan a todos los enemigos', '{"cosmos_min":5}',          '{"summon_souls":3,"soul_damage":40,"status_effect":"fear","duration":2}'),
  (v_deathmasque, 'Acumulación Siniestra','pasiva','Se fortalece con cada enemigo derrotado',                 '{"enemy_defeated":true}',   '{"permanent_attack_bonus":20,"permanent_defense_bonus":10}');

-- Aiolia de Leo
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Aiolia de Leo', 'knight', 'legendary', 7, 'El León dorado con la velocidad de la luz.', 'Athena')
  RETURNING id INTO v_aiolia;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_aiolia, 185, 125, 210, 7, TRUE, 0.3, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_aiolia, 'Lightning Bolt',       'activa', 'Ataque a la velocidad de la luz que siempre impacta primero', '{"cosmos_min":4}', '{"priority_attack":true,"cannot_dodge":true,"damage":140,"paralysis_chance":30}'),
  (v_aiolia, 'Plasma Lightning Bolt','activa', 'Versión mejorada que golpea a múltiples enemigos',             '{"cosmos_min":6}', '{"multi_target":3,"electric_damage":120,"chain_lightning":true}'),
  (v_aiolia, 'Velocidad Lumínica',   'pasiva', 'Siempre ataca primero y esquiva ataques lentos',               '{}',               '{"priority":100,"dodge_slow_attacks":true}');

-- Shaka de Virgo
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Shaka de Virgo', 'knight', 'legendary', 8, 'El hombre más cercano a Dios, maestro de las ilusiones.', 'Athena')
  RETURNING id INTO v_shaka;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_shaka, 165, 160, 240, 8, TRUE, 0.2, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_shaka, 'Rikudō Rinne',     'activa', 'Priva al enemigo de sus cinco sentidos',   '{"cosmos_min":6}', '{"remove_senses":["sight","hearing","smell","taste","touch"],"duration":3,"damage":100}'),
  (v_shaka, 'Tenpō Rinne',      'activa', 'Ataque que daña el alma directamente',     '{"cosmos_min":7}', '{"soul_damage":true,"ignore_all_defenses":true,"damage":200}'),
  (v_shaka, 'Iluminación Divina','pasiva', 'Ve a través de todas las ilusiones',      '{}',               '{"illusion_immunity":true,"sneak_attack_immunity":true,"precognition":true}');

-- Dohko de Libra
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Dohko de Libra', 'knight', 'legendary', 7, 'El Viejo Maestro, guardián de las armas sagradas.', 'Athena')
  RETURNING id INTO v_dohko;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_dohko, 175, 145, 250, 7, TRUE, 0.3, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_dohko, 'Armas de Libra',      'activa', 'Invoca las 12 armas sagradas para un ataque devastador', '{"cosmos_min":6}',                            '{"weapon_barrage":12,"damage_per_weapon":25,"armor_pierce":50}'),
  (v_dohko, 'Cólera del Dragón',   'activa', 'Poder máximo del Dragón de Libra',                       '{"cosmos_min":5,"health_percent_max":50}',     '{"damage":200,"ignore_defense":true,"area_damage":true}'),
  (v_dohko, 'Sabiduría Milenaria', 'pasiva', 'Ve los puntos débiles de todos los enemigos',            '{}',                                           '{"critical_chance":40,"weak_point_detection":true}');

-- Milo de Escorpio
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Milo de Escorpio', 'knight', 'legendary', 7, 'El caballero más letal, maestro del veneno escarlata.', 'Athena')
  RETURNING id INTO v_milo;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_milo, 180, 135, 200, 7, TRUE, 0.3, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_milo, 'Aguja Escarlata', 'activa', '15 agujas venenosas que debilitan progresivamente',                '{"cosmos_min":4}',                              '{"multi_hit":15,"poison_stacks":true,"damage_per_hit":20,"final_hit_bonus":100}'),
  (v_milo, 'Antares',         'activa', 'El aguijón final que mata instantáneamente si muy envenenado',    '{"cosmos_min":6,"target_poison_stacks_min":10}', '{"instant_kill_chance":80,"damage":250}'),
  (v_milo, 'Veneno Letal',    'pasiva', 'Todos los ataques envenenan al enemigo',                         '{}',                                            '{"poison_on_hit":true,"poison_damage":15,"poison_duration":5}');

-- Aiolos de Sagitario
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Aiolos de Sagitario', 'knight', 'legendary', 8, 'El caballero más noble, héroe caído del Santuario.', 'Athena')
  RETURNING id INTO v_aiolos;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_aiolos, 195, 140, 230, 8, TRUE, 0.3, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_aiolos, 'Flecha Dorada',      'activa', 'Disparo certero que nunca falla y atraviesa todo', '{"cosmos_min":5}', '{"cannot_dodge":true,"pierce_all":true,"damage":180,"light_speed":true}'),
  (v_aiolos, 'Atomic Thunder Bolt','activa', 'Poder atómico concentrado en una flecha',          '{"cosmos_min":7}', '{"atomic_damage":true,"area_explosion":true,"damage":300}'),
  (v_aiolos, 'Espíritu Heroico',   'pasiva', 'Inspira a todos los aliados, aumentando sus stats','{}',              '{"ally_attack_bonus":30,"ally_defense_bonus":20,"ally_cosmos_regen":1}');

-- Shura de Capricornio
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Shura de Capricornio', 'knight', 'legendary', 7, 'La espada más afilada del Santuario.', 'Athena')
  RETURNING id INTO v_shura;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_shura, 190, 130, 205, 7, TRUE, 0.4, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_shura, 'Excalibur',        'activa', 'La espada sagrada que corta cualquier cosa',   '{"cosmos_min":5}', '{"cut_anything":true,"ignore_all_defenses":true,"damage":220,"armor_destruction":true}'),
  (v_shura, 'Jumping Stone',    'activa', 'Ataque aéreo devastador desde gran altura',    '{"cosmos_min":4}', '{"aerial_attack":true,"damage":160,"knockdown":true}'),
  (v_shura, 'Maestro de Espada','pasiva', 'Todos los ataques tienen probabilidad de corte crítico','{}',     '{"critical_chance":35,"critical_multiplier":2.5}');

-- Camus de Acuario
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Camus de Acuario', 'knight', 'legendary', 7, 'Maestro del hielo absoluto, el más frío de los caballeros.', 'Athena')
  RETURNING id INTO v_camus;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_camus, 170, 150, 220, 7, TRUE, 0.3, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_camus, 'Ejecución Aurora',          'activa', 'Congela al enemigo a -273°C, el cero absoluto',          '{"cosmos_min":6}', '{"absolute_zero":true,"freeze_duration":3,"shatter_damage":200,"ice_prison":true}'),
  (v_camus, 'Caja de Pandora de Hielo',  'activa', 'Encierra al enemigo en un ataúd de hielo eterno',        '{"cosmos_min":7}', '{"ice_coffin":true,"duration":5,"periodic_damage":30}'),
  (v_camus, 'Corazón de Hielo',          'pasiva', 'Inmune a efectos de estado y emociones',                 '{}',               '{"status_immunity":["charm","fear","rage","confusion"],"emotion_immunity":true}');

-- Afrodita de Piscis
INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Afrodita de Piscis', 'knight', 'legendary', 7, 'La belleza más mortal, maestro de las rosas venenosas.', 'Athena')
  RETURNING id INTO v_afrodita;
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_afrodita, 165, 135, 195, 7, TRUE, 0.4, 'Gold Saint');
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_afrodita, 'Rosas Diabólicas Reales', 'activa', 'Rosas negras que drenan la vida del enemigo', '{"cosmos_min":5}',          '{"life_drain":80,"heal_self":true,"poison_severe":true,"beauty_charm":20}'),
  (v_afrodita, 'Rosas Piranhas',          'activa', 'Rosas carnívoras que devoran al enemigo',     '{"cosmos_min":4}',          '{"multi_hit":8,"damage_per_hit":25,"heal_per_hit":10,"progressive_damage":true}'),
  (v_afrodita, 'Belleza Letal',           'pasiva', 'Su belleza puede encantar enemigos masculinos','{"enemy_gender":"male"}',  '{"charm_chance":25,"attack_reduction":40}');

-- ============================================================
-- TÉCNICAS
-- ============================================================

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Meteoros de Pegaso', 'technique', 'common', 2, 'Ráfaga de meteoritos que golpea múltiples objetivos.', 'Athena')
  RETURNING id INTO v_t_meteoros;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_meteoros, 'Meteoros de Pegaso', 'activa', 'Ataque múltiple a hasta 3 enemigos', '{}', '{"multi_target":3,"damage":60,"meteor_impact":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Rozan Shoryu Ha', 'technique', 'rare', 3, 'El dragón ascendente rompe cualquier defensa.', 'Athena')
  RETURNING id INTO v_t_shoryu;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_shoryu, 'Rozan Shoryu Ha', 'activa', 'Ataque que ignora completamente la defensa', '{}', '{"ignore_defense":true,"damage":120,"uppercut":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Polvo de Diamantes', 'technique', 'rare', 3, 'Cristales de hielo que congelan al enemigo.', 'Athena')
  RETURNING id INTO v_t_polvo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_polvo, 'Polvo de Diamantes', 'activa', 'Congela al enemigo y causa daño por frío', '{}', '{"status_effect":"frozen","duration":2,"ice_damage":80}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Cadena Nebular', 'technique', 'rare', 3, 'Cadenas cósmicas que inmovilizan y dañan.', 'Athena')
  RETURNING id INTO v_t_cadena;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_cadena, 'Cadena Nebular', 'activa', 'Inmoviliza al enemigo y reduce su ataque', '{}', '{"status_effect":"bound","duration":3,"attack_reduction":40,"damage":70}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Ave Fénix', 'technique', 'epic', 4, 'El ave inmortal que renace de las cenizas.', 'Athena')
  RETURNING id INTO v_t_ave;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_ave, 'Ave Fénix', 'activa', 'Daño que aumenta según la vida perdida', '{}', '{"damage_scaling_by_missing_health":3,"fire_damage":true,"resurrection_power":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Lightning Bolt', 'technique', 'epic', 5, 'Rayo a la velocidad de la luz imposible de esquivar.', 'Athena')
  RETURNING id INTO v_t_lightning;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_lightning, 'Lightning Bolt', 'activa', 'Ataque eléctrico instantáneo con parálisis', '{}', '{"cannot_dodge":true,"electric_damage":140,"paralysis_chance":40,"light_speed":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Galaxian Explosion', 'technique', 'legendary', 7, 'Explosión cósmica que arrasa todo a su paso.', 'Athena')
  RETURNING id INTO v_t_galaxy;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_galaxy, 'Galaxian Explosion', 'activa', 'Daño masivo en área con drenaje de cosmos', '{}', '{"area_damage":true,"damage":300,"cosmos_drain":3,"galaxy_destruction":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Excalibur', 'technique', 'legendary', 6, 'La espada sagrada que corta cualquier cosa.', 'Athena')
  RETURNING id INTO v_t_excalibur;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_excalibur, 'Excalibur', 'activa', 'Corte perfecto que ignora todas las defensas', '{}', '{"cut_anything":true,"ignore_all_defenses":true,"damage":250,"armor_destruction":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Cosmos Ardiente', 'technique', 'common', 1, 'Eleva el cosmos interior para aumentar el poder.', 'Athena')
  RETURNING id INTO v_t_cosmos;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_cosmos, 'Cosmos Ardiente', 'activa', 'Aumenta el ataque por 3 turnos', '{}', '{"attack_bonus_percent":30,"duration":3,"cosmos_boost":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Curación Divina', 'technique', 'rare', 3, 'Poder sanador de Athena que restaura la vida.', 'Athena')
  RETURNING id INTO v_t_curacion;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_curacion, 'Curación Divina', 'activa', 'Cura mucha vida a un aliado', '{}', '{"heal_target":120,"remove_status_effects":true,"divine_blessing":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Escudo de Athena', 'technique', 'epic', 4, 'Protección divina que bloquea ataques.', 'Athena')
  RETURNING id INTO v_t_escudo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_escudo, 'Escudo de Athena', 'activa', 'Protege a todos los aliados del próximo ataque', '{}', '{"protect_all_allies":true,"damage_reduction":90,"duration":1,"divine_protection":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Ilusión Psíquica', 'technique', 'rare', 3, 'Confunde la mente del enemigo.', 'Athena')
  RETURNING id INTO v_t_ilusion;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_ilusion, 'Ilusión Psíquica', 'activa', 'Confunde al enemigo y reduce su precisión', '{}', '{"status_effect":"confusion","duration":3,"accuracy_reduction":50,"mind_control":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Telequinesis', 'technique', 'rare', 2, 'Mueve objetos y enemigos con el poder mental.', 'Athena')
  RETURNING id INTO v_t_telequi;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_telequi, 'Telequinesis', 'activa', 'Reposiciona enemigos y causa daño psíquico', '{}', '{"move_enemy":true,"psychic_damage":60,"position_control":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Athena Exclamation', 'technique', 'legendary', 9, 'Técnica prohibida que iguala el Big Bang.', 'Athena')
  RETURNING id INTO v_t_athena_ex;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_athena_ex, 'Athena Exclamation', 'activa', 'Requiere 3 caballeros dorados, daño absoluto',
   '{"gold_knights_required":3,"combined_technique":true}',
   '{"absolute_damage":999,"area_devastation":true,"big_bang_power":true,"self_damage":50}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Formación de Batalla', 'technique', 'epic', 4, 'Coordinación táctica que potencia al equipo.', 'Athena')
  RETURNING id INTO v_t_formacion;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_t_formacion, 'Formación de Batalla', 'activa', 'Todos los aliados reciben bonificaciones', '{}',
   '{"all_allies_attack_bonus":25,"all_allies_defense_bonus":25,"duration":4,"tactical_advantage":true}');

-- ============================================================
-- OBJETOS
-- ============================================================

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Armadura de Pegaso', 'item', 'rare', 3, 'Armadura de bronce que protege al caballero de Pegaso.', 'Athena')
  RETURNING id INTO v_o_arm_pegaso;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_arm_pegaso, 'Protección de Pegaso', 'equipamiento', 'Aumenta defensa y otorga regeneración',
   '{"card_type":"knight"}', '{"defense_bonus":40,"health_regen":10,"armor_self_repair":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Armadura de Sagitario', 'item', 'legendary', 6, 'Armadura dorada del arquero celestial.', 'Athena')
  RETURNING id INTO v_o_arm_sagit;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_arm_sagit, 'Poder de Sagitario', 'equipamiento', 'Aumenta ataque y otorga precisión perfecta',
   '{"card_type":"knight"}', '{"attack_bonus":60,"accuracy":100,"bow_mastery":true,"golden_protection":30}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Armas de Libra', 'item', 'legendary', 7, 'Las 12 armas sagradas del caballero de Libra.', 'Athena')
  RETURNING id INTO v_o_armas_libra;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_armas_libra, 'Arsenal Sagrado', 'activa', 'Permite usar cualquier arma sagrada', '{}',
   '{"weapon_variety":12,"damage_bonus":50,"sacred_weapon_mastery":true,"pierce_all_defenses":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Escudo de Athena', 'item', 'legendary', 5, 'Escudo divino que protege a los elegidos de Athena.', 'Athena')
  RETURNING id INTO v_o_escudo_ath;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_escudo_ath, 'Aegis Divino', 'equipamiento', 'Bloquea ataques y refleja daño', '{}',
   '{"block_chance":60,"reflect_damage_percent":50,"divine_protection":true,"status_immunity":["petrification","death"]}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Rosario de Athena', 'item', 'epic', 4, 'Rosario sagrado que purifica el alma.', 'Athena')
  RETURNING id INTO v_o_rosario;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_rosario, 'Purificación Divina', 'equipamiento', 'Inmunidad a efectos de estado negativos', '{}',
   '{"status_immunity":["poison","curse","confusion","fear"],"holy_aura":true,"cosmos_regen":1}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Báculo de Nike', 'item', 'epic', 5, 'Símbolo de la victoria que inspira triunfo.', 'Athena')
  RETURNING id INTO v_o_baculo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_baculo, 'Aura de Victoria', 'equipamiento', 'Aumenta las probabilidades de éxito', '{}',
   '{"critical_chance":20,"dodge_chance":15,"victory_aura":true,"all_allies_morale_boost":25}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Cristal de Cosmos', 'item', 'rare', 2, 'Cristal que almacena energía cósmica pura.', 'Athena')
  RETURNING id INTO v_o_cristal;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_cristal, 'Reserva Cósmica', 'activa', 'Restaura cosmos al usuario', '{}',
   '{"cosmos_restore":3,"cosmic_energy":true,"one_time_use":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Fragmento de Estrella', 'item', 'epic', 4, 'Pedazo de estrella caída que contiene poder estelar.', 'Athena')
  RETURNING id INTO v_o_fragmento;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_fragmento, 'Poder Estelar', 'equipamiento', 'Aumenta el poder de todas las habilidades', '{}',
   '{"ability_power_bonus":30,"stellar_energy":true,"night_combat_bonus":50}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Néctar Divino', 'item', 'rare', 3, 'Bebida de los dioses que restaura completamente.', 'Athena')
  RETURNING id INTO v_o_nectar;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_nectar, 'Restauración Completa', 'activa', 'Cura toda la vida y elimina efectos negativos', '{}',
   '{"full_heal":true,"remove_all_debuffs":true,"divine_blessing":true,"one_time_use":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Elixir de Cosmos', 'item', 'epic', 4, 'Poción que eleva permanentemente el cosmos.', 'Athena')
  RETURNING id INTO v_o_elixir;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_elixir, 'Elevación Cósmica', 'activa', 'Aumenta permanentemente el cosmos máximo', '{}',
   '{"permanent_cosmos_increase":2,"cosmic_evolution":true,"one_time_use":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Caja de Pandora', 'item', 'epic', 5, 'Reliquia que contiene tanto bendiciones como maldiciones.', 'Athena')
  RETURNING id INTO v_o_pandora;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_pandora, 'Poder de Pandora', 'activa', 'Efecto aleatorio muy poderoso', '{}',
   '{"random_powerful_effect":true,"pandora_chaos":true,"unpredictable":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Lira de Orfeo', 'item', 'legendary', 6, 'Instrumento que controla las emociones y calma a las bestias.', 'Athena')
  RETURNING id INTO v_o_lira;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_lira, 'Melodía Encantadora', 'activa', 'Encanta a todos los enemigos', '{}',
   '{"charm_all_enemies":true,"duration":3,"soothing_melody":true,"beast_taming":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Polvo de Estrellas', 'item', 'common', 1, 'Polvo mágico que potencia temporalmente las habilidades.', 'Athena')
  RETURNING id INTO v_o_polvo_est;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_polvo_est, 'Potenciación Temporal', 'activa', 'La próxima habilidad es más poderosa', '{}',
   '{"next_ability_bonus":50,"stardust_enhancement":true,"one_time_use":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Espejo de la Verdad', 'item', 'rare', 3, 'Revela la verdadera naturaleza de las cosas.', 'Athena')
  RETURNING id INTO v_o_espejo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_espejo, 'Revelación', 'activa', 'Revela todas las cartas ocultas del enemigo', '{}',
   '{"reveal_enemy_hand":true,"truth_sight":true,"illusion_dispel":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Pesas de Mu', 'item', 'rare', 2, 'Pesas telequinéticas para entrenar el cosmos.', 'Athena')
  RETURNING id INTO v_o_pesas;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_pesas, 'Entrenamiento Intensivo', 'equipamiento', 'Gana experiencia adicional en batalla', '{}',
   '{"experience_bonus":50,"training_weights":true,"stat_growth_bonus":20}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Manual de Combate', 'item', 'common', 1, 'Técnicas básicas de combate de caballeros.', 'Athena')
  RETURNING id INTO v_o_manual;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_manual, 'Conocimiento Marcial', 'equipamiento', 'Mejora la precisión y técnica en combate', '{}',
   '{"accuracy_bonus":15,"technique_improvement":true,"combat_knowledge":true}');

-- El Santuario (Escenario) — aura de campo: +2 CE y AR a todos los caballeros rango Steel Saint
-- Nota: tipo 'stage' → zona field_scenario (compartida, 1 por partida)
-- La lógica del aura se aplicará en tiempo de combate por FieldEffectsEngine (Phase 2)
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('El Santuario', 'stage', 'common', 0, 0,
          'El hogar sagrado de Athena. Mientras esté en juego, todos los caballeros de rango St reciben +2 CE y +2 AR.',
          'objects/sanctuary.png', 'Athena', 'steel')
  RETURNING id INTO v_o_sanctuary;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_o_sanctuary, 'Tierra Sagrada', 'campo',
   'Todos los caballeros de Acero (Steel Saint) en el campo reciben +2 CE y +2 AR.',
   '{}',
   '{"field_aura":{"rank":"Steel Saint","ce":2,"ar":2}}');

-- ============================================================
-- ESCENARIOS
-- ============================================================

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Santuario de Athena', 'stage', 'legendary', 8, 'Tierra sagrada donde los caballeros de Athena entrenan y luchan.', 'Athena')
  RETURNING id INTO v_s_santuario;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_santuario, 'Bendición del Santuario', 'campo',
   'Todos los caballeros de Athena reciben bonificaciones',
   '{"faction":"Athena"}',
   '{"all_athena_knights_attack_bonus":30,"all_athena_knights_defense_bonus":30,"cosmos_regen_bonus":1,"sacred_ground":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Casa de Aries', 'stage', 'epic', 5, 'Primera casa del zodíaco, protegida por Mu.', 'Athena')
  RETURNING id INTO v_s_aries;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_aries, 'Barrera Telequinética', 'campo', 'Refleja ataques de proyectiles',
   '{"attack_type":"projectile"}',
   '{"reflect_projectiles":true,"telekinetic_barrier":70,"crystal_wall_protection":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Casa de Leo', 'stage', 'epic', 5, 'Quinta casa zodiacal, dominio del rayo.', 'Athena')
  RETURNING id INTO v_s_leo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_leo, 'Tormenta Eléctrica', 'campo', 'Ataques eléctricos son más poderosos',
   '{"damage_type":"electric"}',
   '{"electric_damage_bonus":50,"paralysis_chance_bonus":20,"lightning_storm":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Casa de Virgo', 'stage', 'epic', 6, 'Sexta casa, el jardín de los dioses más cercano al cielo.', 'Athena')
  RETURNING id INTO v_s_virgo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_virgo, 'Ilusiones de Shaka', 'campo', 'Los enemigos tienen dificultad para distinguir la realidad',
   '{"enemy_turn":true}',
   '{"enemy_accuracy_reduction":30,"illusion_maze":true,"confusion_aura":25}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Cinco Picos Antiguos', 'stage', 'rare', 4, 'Montañas sagradas donde Shiryu entrena.', 'Athena')
  RETURNING id INTO v_s_5picos;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_5picos, 'Entrenamiento de Montaña', 'campo', 'Los caballeros de dragón reciben bonificaciones',
   '{"knight_constellation":"dragon"}',
   '{"defense_bonus":50,"waterfall_training":true,"mountain_endurance":40}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Bosque de la Muerte', 'stage', 'rare', 3, 'Bosque siniestro donde Ikki fue entrenado.', 'Athena')
  RETURNING id INTO v_s_bosque;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_bosque, 'Supervivencia Extrema', 'campo', 'Los caballeros se vuelven más resistentes', '{}',
   '{"all_knights_health_bonus":30,"death_resistance":25,"survival_instinct":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Siberia Helada', 'stage', 'rare', 4, 'Tierras congeladas donde Hyoga dominó el hielo.', 'Athena')
  RETURNING id INTO v_s_siberia;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_siberia, 'Frío Extremo', 'campo', 'Los ataques de hielo son más efectivos',
   '{"damage_type":"ice"}',
   '{"ice_damage_bonus":40,"freeze_duration_bonus":1,"absolute_zero_field":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Coliseo Galáctico', 'stage', 'epic', 6, 'Arena cósmica donde se libran batallas épicas.', 'Athena')
  RETURNING id INTO v_s_coliseo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_coliseo, 'Gloria de Combate', 'campo', 'Todos los combatientes reciben bonificaciones de ataque', '{}',
   '{"all_units_attack_bonus":25,"battle_fervor":true,"cosmic_audience":20}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Templo de Athena', 'stage', 'legendary', 7, 'Santuario interior donde reside la diosa.', 'Athena')
  RETURNING id INTO v_s_templo;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_templo, 'Presencia Divina', 'campo', 'Athena protege a sus caballeros',
   '{"faction":"Athena"}',
   '{"death_protection":true,"divine_intervention":15,"athena_blessing":true,"miracle_chance":10}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Jardín de los Dioses', 'stage', 'epic', 5, 'Paraíso divino donde florecen plantas sagradas.', 'Athena')
  RETURNING id INTO v_s_jardin;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_jardin, 'Regeneración Natural', 'campo', 'Todas las unidades se curan lentamente', '{}',
   '{"all_units_health_regen":15,"natural_healing":true,"paradise_effect":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Biblioteca de Athena', 'stage', 'rare', 4, 'Repositorio de todo el conocimiento del cosmos.', 'Athena')
  RETURNING id INTO v_s_biblioteca;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_biblioteca, 'Sabiduría Ancestral', 'campo', 'Las técnicas cuestan menos cosmos',
   '{"card_type":"technique"}',
   '{"technique_cost_reduction":1,"knowledge_bonus":true,"wisdom_of_ages":25}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Lago de los Cisnes', 'stage', 'rare', 3, 'Lago sereno donde Hyoga entrena su cosmos.', 'Athena')
  RETURNING id INTO v_s_lago;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_lago, 'Serenidad Helada', 'campo', 'Inmunidad a efectos de estado emocionales', '{}',
   '{"emotion_immunity":true,"tranquil_waters":true,"ice_affinity":30}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Tartarus Infernal', 'stage', 'epic', 5, 'Prisión de las almas condenadas en el inframundo.', 'Athena')
  RETURNING id INTO v_s_tartarus;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_tartarus, 'Tormento Eterno', 'campo', 'Todas las unidades reciben daño por turno', '{}',
   '{"all_units_burn_damage":20,"soul_torment":true,"infernal_flames":true}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Dimensión Distorsionada', 'stage', 'epic', 6, 'Espacio-tiempo alterado donde las reglas no aplican.', 'Athena')
  RETURNING id INTO v_s_dimension;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_dimension, 'Caos Dimensional', 'campo', 'Efectos aleatorios cada turno', '{}',
   '{"random_effects":true,"dimensional_chaos":true,"reality_distortion":40}');

INSERT INTO cards (name, type, rarity, cost, description, faction)
  VALUES ('Campo de Batalla Neutral', 'stage', 'common', 2, 'Terreno equilibrado sin ventajas especiales.', 'Athena')
  RETURNING id INTO v_s_neutral;
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_s_neutral, 'Terreno Equilibrado', 'campo', 'No hay bonificaciones ni penalizaciones', '{}',
   '{"balanced_field":true,"no_special_effects":true}');

-- ============================================================
-- ABILITY KEYS
-- Popula ability_key en todos los registros que no tengan uno.
-- Fórmula: lowercase → quitar acentos → [^a-z0-9]+ → '_'
-- Esto permite matching estable desde el motor sin depender de
-- la capitalización o acentuación del campo name.
-- ============================================================
UPDATE card_abilities
SET ability_key = regexp_replace(
  lower(translate(
    name,
    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙãõÃÕ',
    'aeiouunAEIOUUNaeiouAEIOUaoAO'
  )),
  '[^a-z0-9]+', '_', 'g'
)
WHERE ability_key IS NULL;

END $$;
