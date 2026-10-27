// Script para limpiar partidas en waiting/activas
import sequelize from '../config/database';
import Match from '../infrastructure/database/models/Match';

async function cleanMatches() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos');

    // Eliminar TODAS las partidas
    const deleted = await Match.destroy({
      where: {},
      truncate: false
    });

    console.log(`🧹 Eliminadas ${deleted} partidas`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanMatches();
