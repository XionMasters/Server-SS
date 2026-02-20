// src/scripts/addCurrentDeckBackIdColumn.ts
// Script para agregar la columna current_deck_back_id a la tabla decks

import { Sequelize, DataTypes } from 'sequelize';
import * as dotenv from 'dotenv';

dotenv.config();

async function addCurrentDeckBackIdColumn() {
  const sequelize = new Sequelize({
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'caballeros_cosmicos',
    logging: false,
  });

  try {
    console.log('🔧 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado a PostgreSQL');

    console.log('🔧 Verificando si la columna existe...');
    
    // Usar rawConnection para mejor manejo
    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable('decks');
    
    if (columns['current_deck_back_id']) {
      console.log('✅ La columna current_deck_back_id ya existe');
      await sequelize.close();
      process.exit(0);
    }

    console.log('🔧 Agregando columna current_deck_back_id...');
    await queryInterface.addColumn('decks', 'current_deck_back_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'deck_backs',
        key: 'id',
      },
      onDelete: 'SET NULL',
    });

    console.log('✅ Columna current_deck_back_id agregada exitosamente');
    await sequelize.close();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addCurrentDeckBackIdColumn();
