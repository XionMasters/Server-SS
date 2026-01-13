// Script para agregar rareza 'divina' al enum
import { sequelize } from '../config/database';

async function addDivinaRarity() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');

    console.log('🔄 Agregando rareza "divina" al enum...');
    await sequelize.query(`
      ALTER TYPE enum_cards_rarity ADD VALUE IF NOT EXISTS 'divina';
    `);
    console.log('✅ Rareza "divina" agregada al enum\n');

    console.log('🎉 Migración completada');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la migración:', error);
    process.exit(1);
  }
}

addDivinaRarity();
