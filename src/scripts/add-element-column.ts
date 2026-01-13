// Script para agregar la columna 'element' a la tabla 'cards'
import { sequelize } from '../config/database';

async function addElementColumn() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos');

    // Primero, crear el tipo ENUM si no existe
    console.log('🔄 Creando tipo ENUM para elements...');
    await sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_cards_element AS ENUM ('steel', 'fire', 'water', 'earth', 'wind', 'light', 'dark');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Tipo ENUM creado o ya existía');

    // Agregar la columna element a la tabla cards
    console.log('🔄 Agregando columna element a la tabla cards...');
    await sequelize.query(`
      ALTER TABLE cards 
      ADD COLUMN IF NOT EXISTS element enum_cards_element;
    `);
    console.log('✅ Columna element agregada exitosamente');

    console.log('🎉 Migración completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  }
}

addElementColumn();
