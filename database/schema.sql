-- =============================================================
-- Caballeros Cósmicos - Schema PostgreSQL
-- Generado desde modelos Sequelize
-- Uso: psql -U <usuario> -d <base_de_datos> -f schema.sql
-- =============================================================

-- Crear la base de datos (ejecutar conectado a postgres, no a la BD destino)
-- CREATE DATABASE caballeros_cosmicos;
-- \c caballeros_cosmicos

-- Extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- TIPOS ENUM
-- =============================================================

CREATE TYPE card_type_enum AS ENUM (
    'knight', 'technique', 'item', 'stage', 'helper', 'event',
    'caballero', 'técnica', 'objeto', 'escenario', 'ayudante', 'ocasión',
    'tecnica', 'ocasion'
);

CREATE TYPE card_rarity_enum AS ENUM (
    'common', 'rare', 'epic', 'legendary', 'divine'
);

CREATE TYPE card_element_enum AS ENUM (
    'steel', 'fire', 'water', 'earth', 'wind', 'light', 'dark'
);

CREATE TYPE card_ability_type_enum AS ENUM (
    'activa', 'pasiva', 'equipamiento', 'campo'
);

CREATE TYPE card_language_enum AS ENUM ('es', 'en', 'pt');

CREATE TYPE match_phase_enum AS ENUM (
    'waiting', 'starting', 'player1_turn', 'player2_turn', 'finished'
);

CREATE TYPE card_in_play_zone_enum AS ENUM (
    'hand', 'field_knight', 'field_support', 'field_helper',
    'yomotsu', 'cositos', 'deck'
);

CREATE TYPE match_action_type_enum AS ENUM (
    'play_card', 'attack', 'defend', 'change_mode',
    'activate_ability', 'pass_turn', 'surrender'
);

CREATE TYPE chat_message_type_enum AS ENUM ('global', 'system', 'whisper');

CREATE TYPE transaction_type_enum AS ENUM ('EARN', 'SPEND');

CREATE TYPE transaction_reason_enum AS ENUM (
    'REGISTRATION_BONUS', 'DAILY_LOGIN', 'MATCH_WIN', 'MATCH_PARTICIPATION',
    'ACHIEVEMENT', 'QUEST_REWARD', 'ADMIN_GIFT', 'EVENT_REWARD',
    'PACK_PURCHASE', 'CARD_PURCHASE', 'UPGRADE_COST', 'TOURNAMENT_FEE',
    'PREMIUM_FEATURE'
);

CREATE TYPE card_transaction_type_enum AS ENUM ('ACQUIRE', 'LOSE');

CREATE TYPE card_transaction_reason_enum AS ENUM (
    'PACK_OPENING', 'DIRECT_PURCHASE', 'TRADE_RECEIVED', 'QUEST_REWARD',
    'EVENT_REWARD', 'ADMIN_GIFT', 'STARTER_PACK', 'STARTER_DECK',
    'ACHIEVEMENT_REWARD', 'TRADE_SENT', 'CARD_SALE', 'UPGRADE_MATERIAL',
    'ADMIN_REMOVAL', 'TOURNAMENT_ANTE'
);

CREATE TYPE pack_guaranteed_rarity_enum AS ENUM ('comun', 'rara', 'epica', 'legendaria');

CREATE TYPE profile_avatar_unlock_type_enum AS ENUM (
    'default', 'card_unlock', 'achievement', 'special'
);

CREATE TYPE avatar_rarity_enum AS ENUM (
    'common', 'rare', 'epic', 'legendary', 'divine'
);

CREATE TYPE deck_back_unlock_type_enum AS ENUM (
    'default', 'achievement', 'purchase', 'seasonal'
);

CREATE TYPE deck_back_rarity_enum AS ENUM (
    'common', 'rare', 'epic', 'legendary'
);

CREATE TYPE user_deck_back_source_enum AS ENUM (
    'initial_setup', 'card_unlock', 'achievement', 'purchase', 'seasonal'
);

-- =============================================================
-- TABLAS (en orden de dependencias)
-- =============================================================

-- -------------------------------------------------------------
-- users
-- -------------------------------------------------------------
CREATE TABLE users (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username                    VARCHAR(50)  NOT NULL UNIQUE,
    email                       VARCHAR(255) NOT NULL UNIQUE,
    password_hash               VARCHAR(255) NOT NULL,
    currency                    INTEGER      NOT NULL DEFAULT 1000,
    is_email_verified           BOOLEAN      NOT NULL DEFAULT FALSE,
    email_verification_token    VARCHAR(255),
    email_verification_expires  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- cards
-- -------------------------------------------------------------
CREATE TABLE cards (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code            VARCHAR(100)        NOT NULL UNIQUE,
    name            VARCHAR(100)        NOT NULL,
    type            card_type_enum      NOT NULL,
    rarity          card_rarity_enum    NOT NULL,
    cost            INTEGER             NOT NULL DEFAULT 0,
    generate        INTEGER             NOT NULL DEFAULT 0,
    description     TEXT,
    image_url       VARCHAR(255),
    faction         VARCHAR(50),
    element         card_element_enum,
    max_copies      INTEGER             NOT NULL DEFAULT 3,
    "unique"        BOOLEAN             NOT NULL DEFAULT FALSE,
    playable_zones  TEXT[]              DEFAULT ARRAY['battlefield'],
    collection_id   VARCHAR(50),
    artist          VARCHAR(100),
    language        VARCHAR(10)         DEFAULT 'es',
    balance_notes   TEXT,
    power_level     INTEGER,
    tags            TEXT[]              DEFAULT ARRAY[]::TEXT[],
    card_set        VARCHAR(100),
    release_year    INTEGER,
    notes           TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- card_knights
-- -------------------------------------------------------------
CREATE TABLE card_knights (
    card_id          UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
    attack           INTEGER        NOT NULL,
    defense          INTEGER        NOT NULL,
    health           INTEGER        NOT NULL,
    cosmos           INTEGER        NOT NULL,
    can_defend       BOOLEAN        NOT NULL DEFAULT TRUE,
    defense_reduction DECIMAL(3,2)  NOT NULL DEFAULT 0.5
);

-- -------------------------------------------------------------
-- card_abilities
-- -------------------------------------------------------------
CREATE TABLE card_abilities (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id     UUID                    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    name        VARCHAR(100)            NOT NULL,
    type        card_ability_type_enum  NOT NULL,
    description TEXT                    NOT NULL,
    conditions  JSONB                   NOT NULL DEFAULT '{}',
    effects     JSONB                   NOT NULL,
    created_at  TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- card_translations
-- -------------------------------------------------------------
CREATE TABLE card_translations (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    card_id              UUID               NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    language             card_language_enum NOT NULL,
    name                 VARCHAR(100)       NOT NULL,
    description          TEXT,
    ability_translations JSONB,
    created_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
    UNIQUE (card_id, language)
);

-- -------------------------------------------------------------
-- packs
-- -------------------------------------------------------------
CREATE TABLE packs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(100)                 NOT NULL,
    description         TEXT,
    price               INTEGER                      NOT NULL CHECK (price >= 1),
    cards_per_pack      INTEGER                      NOT NULL DEFAULT 5 CHECK (cards_per_pack BETWEEN 1 AND 15),
    guaranteed_rarity   pack_guaranteed_rarity_enum,
    is_active           BOOLEAN                      NOT NULL DEFAULT TRUE,
    image_url           VARCHAR(255),
    created_at          TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ                  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- pack_cards  (pool de cartas disponibles en cada pack)
-- -------------------------------------------------------------
CREATE TABLE pack_cards (
    pack_id     UUID        NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    card_id     UUID        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    weight      INTEGER     NOT NULL DEFAULT 1 CHECK (weight >= 1),
    PRIMARY KEY (pack_id, card_id)
);

-- -------------------------------------------------------------
-- profile_avatars
-- -------------------------------------------------------------
CREATE TABLE profile_avatars (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(100)                    NOT NULL,
    image_url         VARCHAR(500)                    NOT NULL,
    unlock_type       profile_avatar_unlock_type_enum NOT NULL DEFAULT 'default',
    required_card_id  UUID REFERENCES cards(id) ON DELETE SET NULL,
    rarity            avatar_rarity_enum              NOT NULL DEFAULT 'common',
    is_active         BOOLEAN                         NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ                     NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ                     NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- deck_backs
-- -------------------------------------------------------------
CREATE TABLE deck_backs (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name              VARCHAR(255)              NOT NULL,
    image_url         VARCHAR(255)              NOT NULL,
    unlock_type       deck_back_unlock_type_enum NOT NULL DEFAULT 'default',
    required_card_id  UUID,
    rarity            deck_back_rarity_enum      NOT NULL DEFAULT 'common',
    is_active         BOOLEAN                    NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ                NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ                NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- decks
-- -------------------------------------------------------------
CREATE TABLE decks (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name                 VARCHAR(100) NOT NULL,
    description          TEXT,
    is_active            BOOLEAN      NOT NULL DEFAULT FALSE,
    current_deck_back_id UUID         REFERENCES deck_backs(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- deck_cards
-- -------------------------------------------------------------
CREATE TABLE deck_cards (
    deck_id   UUID    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_id   UUID    NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    quantity  INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 3),
    PRIMARY KEY (deck_id, card_id)
);

-- -------------------------------------------------------------
-- user_cards
-- -------------------------------------------------------------
CREATE TABLE user_cards (
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id     UUID        NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    is_foil     BOOLEAN     NOT NULL DEFAULT FALSE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, card_id)
);

-- -------------------------------------------------------------
-- user_packs
-- -------------------------------------------------------------
CREATE TABLE user_packs (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pack_id     UUID        NOT NULL REFERENCES packs(id) ON DELETE CASCADE,
    quantity    INTEGER     NOT NULL DEFAULT 1 CHECK (quantity >= 1),
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- user_transactions
-- -------------------------------------------------------------
CREATE TABLE user_transactions (
    id                   UUID                     PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID                     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount               INTEGER                  NOT NULL CHECK (amount >= 1),
    type                 transaction_type_enum    NOT NULL,
    reason               transaction_reason_enum  NOT NULL,
    description          VARCHAR(255)             NOT NULL,
    related_entity_type  VARCHAR(50),
    related_entity_id    UUID,
    balance_before       INTEGER                  NOT NULL,
    balance_after        INTEGER                  NOT NULL,
    metadata             JSONB                    DEFAULT '{}',
    created_at           TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- user_card_transactions
-- -------------------------------------------------------------
CREATE TABLE user_card_transactions (
    id                   UUID                          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID                          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    card_id              UUID                          NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    quantity             INTEGER                       NOT NULL CHECK (quantity >= 1),
    type                 card_transaction_type_enum    NOT NULL,
    reason               card_transaction_reason_enum  NOT NULL,
    description          VARCHAR(255)                  NOT NULL,
    is_foil              BOOLEAN                       NOT NULL DEFAULT FALSE,
    related_entity_type  VARCHAR(50),
    related_entity_id    UUID,
    metadata             JSONB                         DEFAULT '{}',
    created_at           TIMESTAMPTZ                   NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- user_sessions
-- -------------------------------------------------------------
CREATE TABLE user_sessions (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       TEXT        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    ip_address  VARCHAR(255),
    user_agent  VARCHAR(255)
);

-- -------------------------------------------------------------
-- user_profiles
-- -------------------------------------------------------------
CREATE TABLE user_profiles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    avatar_image_id  UUID NOT NULL REFERENCES profile_avatars(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- user_avatar_unlocks
-- -------------------------------------------------------------
CREATE TABLE user_avatar_unlocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    avatar_id       UUID        NOT NULL REFERENCES profile_avatars(id) ON DELETE CASCADE,
    unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlock_source   VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, avatar_id)
);

-- -------------------------------------------------------------
-- user_deck_back_unlocks
-- -------------------------------------------------------------
CREATE TABLE user_deck_back_unlocks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID                        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deck_back_id    UUID                        NOT NULL REFERENCES deck_backs(id) ON DELETE CASCADE,
    unlock_source   user_deck_back_source_enum  NOT NULL DEFAULT 'initial_setup',
    unlocked_at     TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- matches
-- -------------------------------------------------------------
CREATE TABLE matches (
    id                  UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
    player1_id          UUID             NOT NULL REFERENCES users(id),
    player2_id          UUID             REFERENCES users(id),
    player1_deck_id     UUID             NOT NULL REFERENCES decks(id),
    player2_deck_id     UUID             REFERENCES decks(id),
    current_turn        INTEGER          NOT NULL DEFAULT 1,
    current_player      INTEGER          NOT NULL DEFAULT 1 CHECK (current_player IN (1, 2)),
    phase               match_phase_enum NOT NULL DEFAULT 'waiting',
    winner_id           UUID             REFERENCES users(id),
    player1_life        INTEGER          NOT NULL DEFAULT 12,
    player2_life        INTEGER          NOT NULL DEFAULT 12,
    player1_cosmos      INTEGER          NOT NULL DEFAULT 0,
    player2_cosmos      INTEGER          NOT NULL DEFAULT 0,
    player1_deck_order  JSONB            DEFAULT '[]',
    player2_deck_order  JSONB            DEFAULT '[]',
    player1_deck_index  INTEGER          NOT NULL DEFAULT 0,
    player2_deck_index  INTEGER          NOT NULL DEFAULT 0,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- cards_in_play
-- -------------------------------------------------------------
CREATE TABLE cards_in_play (
    id                    UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id              UUID                    NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    card_id               UUID                    NOT NULL REFERENCES cards(id),
    player_number         INTEGER                 NOT NULL CHECK (player_number IN (1, 2)),
    zone                  card_in_play_zone_enum  NOT NULL,
    position              INTEGER                 NOT NULL DEFAULT 0,
    is_defensive_mode     VARCHAR(20)             NOT NULL DEFAULT 'normal',
    current_attack        INTEGER                 NOT NULL DEFAULT 0,
    current_defense       INTEGER                 NOT NULL DEFAULT 0,
    current_health        INTEGER                 NOT NULL DEFAULT 0,
    current_cosmos        INTEGER                 NOT NULL DEFAULT 0,
    attached_cards        TEXT                    NOT NULL DEFAULT '[]',
    status_effects        TEXT                    NOT NULL DEFAULT '[]',
    can_attack_this_turn  BOOLEAN                 NOT NULL DEFAULT TRUE,
    has_attacked_this_turn BOOLEAN                NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- match_actions
-- -------------------------------------------------------------
CREATE TABLE match_actions (
    id           UUID                      PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id     UUID                      NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    player_id    UUID                      NOT NULL REFERENCES users(id),
    turn_number  INTEGER                   NOT NULL,
    action_type  match_action_type_enum    NOT NULL,
    action_data  TEXT                      NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ               NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- chat_messages
-- -------------------------------------------------------------
CREATE TABLE chat_messages (
    id              UUID                     PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID                     NOT NULL REFERENCES users(id),
    username        VARCHAR(100)             NOT NULL,
    message         TEXT                     NOT NULL,
    message_type    chat_message_type_enum   NOT NULL DEFAULT 'global',
    target_user_id  UUID                     REFERENCES users(id),
    created_at      TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------
-- processed_actions
-- -------------------------------------------------------------
CREATE TABLE processed_actions (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id     UUID        NOT NULL UNIQUE,
    match_id      UUID        NOT NULL,
    player_number SMALLINT    NOT NULL CHECK (player_number IN (1, 2)),
    action_type   VARCHAR(50) NOT NULL,
    cached_result JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================
-- ÍNDICES
-- =============================================================

CREATE INDEX idx_cards_type        ON cards(type);
CREATE INDEX idx_cards_rarity      ON cards(rarity);
CREATE INDEX idx_cards_faction     ON cards(faction);

CREATE INDEX idx_decks_user_id     ON decks(user_id);
CREATE INDEX idx_deck_cards_deck   ON deck_cards(deck_id);

CREATE INDEX idx_user_cards_user   ON user_cards(user_id);
CREATE INDEX idx_user_cards_card   ON user_cards(card_id);

CREATE INDEX idx_matches_p1        ON matches(player1_id);
CREATE INDEX idx_matches_p2        ON matches(player2_id);
CREATE INDEX idx_matches_phase     ON matches(phase);

CREATE INDEX idx_cards_in_play_match    ON cards_in_play(match_id);
CREATE INDEX idx_cards_in_play_zone     ON cards_in_play(match_id, zone);
CREATE INDEX idx_cards_in_play_player   ON cards_in_play(match_id, player_number);

CREATE INDEX idx_match_actions_match    ON match_actions(match_id);
CREATE INDEX idx_match_actions_player   ON match_actions(player_id);

CREATE INDEX idx_chat_messages_created  ON chat_messages(created_at);
CREATE INDEX idx_chat_messages_user     ON chat_messages(user_id);

CREATE UNIQUE INDEX idx_processed_actions_action_id  ON processed_actions(action_id);
CREATE INDEX idx_processed_actions_match_id          ON processed_actions(match_id);
CREATE INDEX idx_processed_actions_created_at        ON processed_actions(created_at);
CREATE INDEX idx_processed_actions_match_action      ON processed_actions(match_id, action_type);

CREATE INDEX idx_user_sessions_user     ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_active   ON user_sessions(is_active);

CREATE INDEX idx_user_transactions_user ON user_transactions(user_id);
CREATE INDEX idx_user_card_tx_user      ON user_card_transactions(user_id);
CREATE INDEX idx_user_card_tx_card      ON user_card_transactions(card_id);

CREATE INDEX idx_card_translations_card ON card_translations(card_id);

CREATE INDEX idx_pack_cards_pack  ON pack_cards(pack_id);
CREATE INDEX idx_pack_cards_card  ON pack_cards(card_id);
