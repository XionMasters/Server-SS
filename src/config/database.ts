// src/config/database.ts
import { DataTypes, Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  database: process.env.DB_NAME || 'caballeros_cosmicos',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
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
    await import('../models/associations');
    
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
        if (!colError.message.includes('already exists')) {
          console.warn('⚠️  No se pudieron aplicar migraciones defensivas:', colError.message);
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