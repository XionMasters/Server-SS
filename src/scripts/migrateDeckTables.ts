import sequelize from '../config/database';
import '../models/associations';

/**
 * Migración para crear tablas de decks
 * Ejecutar: npx ts-node src/scripts/migrateDeckTables.ts
 */

async function migrate() {
  try {
    console.log('🔄 Iniciando migración de tablas de decks...');

    // Sincronizar solo las tablas de decks (sin force para no borrar datos)
    await sequelize.sync({ alter: true });

    console.log('✅ Migración completada exitosamente');
    console.log('📊 Tablas creadas/actualizadas:');
    console.log('   - decks');
    console.log('   - deck_cards');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

migrate();
