// src/config/database.ts
import { DataTypes, Sequelize } from 'sequelize';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'caballeros_cosmicos',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  dialect: 'postgres',
  logging: (sql, timing) => { if (sql.includes('ERROR')) console.log(sql); }, //process.env.NODE_ENV === 'development' ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

export const connectDatabase = async (): Promise<void> => {
  try {
    // Importar asociaciones después de que sequelize esté definido
    await import('../infrastructure/database/models/associations');
    
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos PostgreSQL');
    
    // Sincronizar modelos (en desarrollo)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ force: false }); // No borrar datos existentes
      console.log('📊 Modelos sincronizados con la base de datos');
      
      // Migraciones defensivas para entornos locales con esquema desfasado.
      try {
        const queryInterface = sequelize.getQueryInterface();
        const deckColumns = await queryInterface.describeTable('decks');
        if (!deckColumns['current_deck_back_id']) {
          console.log('🔧 Agregando columna current_deck_back_id a tabla decks...');
          await queryInterface.addColumn('decks', 'current_deck_back_id', {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
              model: 'deck_backs',
              key: 'id',
            },
            onDelete: 'SET NULL',
          });
          console.log('✅ Columna current_deck_back_id agregada.');
        }

        const matchColumns = await queryInterface.describeTable('matches');
        if (!matchColumns['pending_selection']) {
          console.log('🔧 Agregando columna pending_selection a tabla matches...');
          await queryInterface.addColumn('matches', 'pending_selection', {
            type: DataTypes.JSONB,
            allowNull: true,
            defaultValue: null,
          });
          console.log('✅ Columna pending_selection agregada.');
        }
        if (!matchColumns['rng_seed']) {
          console.log('🔧 Agregando columna rng_seed a tabla matches...');
          await queryInterface.addColumn('matches', 'rng_seed', {
            type: DataTypes.BIGINT,
            allowNull: true,
          });
          await sequelize.query(`
            UPDATE matches
            SET rng_seed = hashtext(id::text)
            WHERE rng_seed IS NULL
          `);
          await queryInterface.changeColumn('matches', 'rng_seed', {
            type: DataTypes.BIGINT,
            allowNull: false,
            defaultValue: 0,
          });
          console.log('✅ Columna rng_seed agregada y normalizada.');
        }

        if (!matchColumns['first_player']) {
          console.log('🔧 Aplicando migración 013 (matches.first_player)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/013_add_first_player_to_matches.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 013 aplicada.');
        }

        if (!matchColumns['turn_counters']) {
          console.log('🔧 Aplicando migración 015 (matches.turn_counters)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/015_add_turn_counters_to_matches.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 015 aplicada.');
        }

        // 016: el enum de cards.rarity se llama distinto según cómo se creó la BD
        // (schema.sql: card_rarity_enum; sequelize.sync: enum_cards_rarity): se mira el de la columna
        const packColumns = await queryInterface.describeTable('packs');
        const [uncommonRows] = await sequelize.query(`
          SELECT 1 FROM information_schema.columns c
            JOIN pg_type t ON t.typname = c.udt_name
            JOIN pg_enum e ON e.enumtypid = t.oid AND e.enumlabel = 'uncommon'
           WHERE c.table_schema = current_schema() AND c.table_name = 'cards' AND c.column_name = 'rarity'
        `);
        if (!packColumns['code'] || (uncommonRows as unknown[]).length === 0) {
          console.log('🔧 Aplicando migración 016 (sobres v2 y rareza uncommon)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/016_packs_v2_and_uncommon.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 016 aplicada.');
        }

        const tables = (await queryInterface.showAllTables()).map((t: any) => (typeof t === 'string' ? t : t.tableName));
        if (!tables.includes('match_replays') || !tables.includes('match_replay_frames')) {
          console.log('🔧 Aplicando migración 014 (repeticiones de partidas)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/014_create_match_replays.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 014 aplicada.');
        }

        const userColumns = await queryInterface.describeTable('users');
        if (!userColumns['blocked_at']) {
          console.log('🔧 Agregando columna blocked_at a tabla users...');
          await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ NULL');
          console.log('✅ Columna blocked_at agregada.');
        }

        const abilityColumns = await queryInterface.describeTable('card_abilities');
        if (!abilityColumns['ability_key']) {
          console.log('🔧 Aplicando migración 009 (card_abilities.ability_key)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/009_add_ability_key_to_card_abilities.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Columna ability_key agregada y rellenada.');
        }

        const cardColumns = await queryInterface.describeTable('cards');
        if (!cardColumns['code']) {
          console.log('🔧 Agregando columna code a tabla cards...');
          await queryInterface.addColumn('cards', 'code', {
            type: DataTypes.STRING(100),
            allowNull: true,
          });

          // Backfill: genera un code estable y único usando nombre + sufijo de id.
          await sequelize.query(`
            UPDATE cards
            SET code = LOWER(
              REGEXP_REPLACE(COALESCE(name, 'card'), '[^a-zA-Z0-9]+', '_', 'g')
            ) || '_' || LEFT(REPLACE(id::text, '-', ''), 8)
            WHERE code IS NULL OR code = ''
          `);

          await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_code ON cards(code)');
          await sequelize.query('ALTER TABLE cards ALTER COLUMN code SET NOT NULL');

          console.log('✅ Columna code agregada y normalizada.');
        }

        const techniqueColumns = await queryInterface.describeTable('card_techniques');
        if (!cardColumns['character'] || !techniqueColumns['target_all'] || !techniqueColumns['ignore_defense_mode']) {
          console.log('🔧 Aplicando migración 010 (cards.character, card_techniques.target_all/ignore_defense_mode)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/010_add_character_and_technique_flags.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 010 aplicada.');
        }

        const knightColumns = await queryInterface.describeTable('card_knights');
        if (!knightColumns['rank']) {
          console.log('🔧 Agregando columna rank a tabla card_knights...');
          await queryInterface.addColumn('card_knights', 'rank', {
            // Usamos STRING para compatibilidad con esquemas previos y evitar fallos por tipos faltantes.
            type: DataTypes.STRING(32),
            allowNull: true,
          });
          await sequelize.query('CREATE INDEX IF NOT EXISTS idx_card_knights_rank ON card_knights(rank)');
          console.log('✅ Columna rank agregada.');
        }

        const cardInPlayColumns = await queryInterface.describeTable('cards_in_play');
        if (cardInPlayColumns['is_defensive_mode']?.type === 'BOOLEAN') {
          console.log('🔧 Aplicando migración 012 (cards_in_play.is_defensive_mode BOOLEAN → VARCHAR)...');
          const sql = fs.readFileSync(
            path.resolve(__dirname, '../../src/migrations/sql/012_cards_in_play_defensive_mode_varchar.sql'),
            'utf8'
          );
          await sequelize.query(sql);
          console.log('✅ Migración 012 aplicada.');
        }

        if (!deckColumns['deck_cover_card_id']) {
          console.log('🔧 Agregando columna deck_cover_card_id a tabla decks...');
          await sequelize.query(`
            ALTER TABLE decks
            ADD COLUMN deck_cover_card_id UUID REFERENCES cards(id) ON DELETE SET NULL
          `);
          console.log('✅ Columna deck_cover_card_id agregada');
        }
      } catch (colError: any) {
        // Arrancar con un esquema a medias produce errores confusos más tarde (F12)
        if (!colError.message?.includes('already exists')) {
          console.error('❌ No se pudieron aplicar migraciones defensivas:', colError.message);
          throw colError;
        }
      }
    }
  } catch (error) {
    console.error('❌ Error conectando a la base de datos:', error);
    throw error;
  }
};

export { sequelize };
export default sequelize;