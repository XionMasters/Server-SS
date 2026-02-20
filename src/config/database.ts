// src/config/database.ts
import { Sequelize } from 'sequelize';
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
      
      // Agregar columna current_deck_back_id si no existe
      try {
        const queryInterface = sequelize.getQueryInterface();
        const columns = await queryInterface.describeTable('decks');
        
        if (!columns['current_deck_back_id']) {
          console.log('🔧 Agregando columna current_deck_back_id a tabla decks...');
          await sequelize.query(`
            ALTER TABLE decks
            ADD COLUMN current_deck_back_id UUID REFERENCES deck_backs(id) ON DELETE SET NULL
          `);
          console.log('✅ Columna current_deck_back_id agregada');
        }
      } catch (colError: any) {
        if (!colError.message.includes('already exists')) {
          console.warn('⚠️  No se pudo agregar columna:', colError.message);
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