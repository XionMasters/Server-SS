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