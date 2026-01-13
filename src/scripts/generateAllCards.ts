// src/scripts/generateAllCards.ts
import { sequelize } from '../config/database';
import { generateAllCardsByType, generateCardType } from './cards/index';

/**
 * Script principal para generar todas las cartas del juego
 * Ahora organizado por tipos para mejor organización y mantenimiento
 * 
 * USO:
 * - npm run generate-cards: Genera todas las cartas
 * - node -e "require('./dist/scripts/generateAllCards').generateByType('bronze')"
 */

async function main() {
  try {
    console.log('🔗 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conexión establecida correctamente.');

    // Sincronizar modelos (crear tablas si no existen)
    await sequelize.sync({ force: false });
    console.log('🔄 Modelos sincronizados.');

    // Generar todas las cartas organizadas por tipo
    await generateAllCardsByType();

    console.log('🎉 ¡Generación completada exitosamente!');
    console.log('💡 Usa generateCardType("tipo") para regenerar solo un tipo específico');

  } catch (error) {
    console.error('❌ Error durante la generación:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
    console.log('🔌 Conexión cerrada.');
  }
}

// Función para generar por tipo específico (útil para desarrollo)
export async function generateByType(type: string) {
  try {
    console.log('🔗 Conectando a la base de datos...');
    await sequelize.authenticate();
    await sequelize.sync({ force: false });

    await generateCardType(type);

    console.log(`🎉 Cartas de tipo "${type}" generadas exitosamente!`);
  } catch (error) {
    console.error(`❌ Error generando cartas de tipo "${type}":`, error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  main();
}

// Exportar funciones para uso programático
export { generateAllCardsByType, generateCardType };
export default main;