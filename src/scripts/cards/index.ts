// src/scripts/cards/index.ts
import { createBronzeKnights } from './bronzeKnights';
import { createSilverKnights } from './silverKnights';
import { createGoldKnights } from './goldKnights';
import { createTechniques } from './techniques';
import { createObjects } from './objects';
import { createScenarios } from './scenarios';

export async function generateAllCardsByType() {
  console.log('🎮 INICIANDO GENERACIÓN MODULAR DE CARTAS 🎮');
  console.log('================================================');
  
  try {
    // Caballeros por categoría
    await createBronzeKnights();
    console.log('');
    
    await createSilverKnights();
    console.log('');
    
    await createGoldKnights();
    console.log('');
    
    // Otros tipos de cartas
    await createTechniques();
    console.log('');
    
    await createObjects();
    console.log('');
    
    await createScenarios();
    console.log('');
    
    console.log('🎉 ¡GENERACIÓN COMPLETA! 🎉');
    console.log('============================');
    console.log('✅ Caballeros de Bronce: 10 cartas');
    console.log('✅ Caballeros de Plata: 8 cartas');
    console.log('✅ Caballeros Dorados: 12 cartas');
    console.log('✅ Técnicas: 16 cartas');
    console.log('✅ Objetos Místicos: 16 cartas');
    console.log('✅ Escenarios: 15 cartas');
    console.log('📊 TOTAL: 77 cartas generadas');
    
  } catch (error) {
    console.error('❌ Error durante la generación:', error);
    throw error;
  }
}

// Funciones individuales para generar por tipo
export {
  createBronzeKnights,
  createSilverKnights,
  createGoldKnights,
  createTechniques,
  createObjects,
  createScenarios
};

// Función para regenerar solo un tipo específico
export async function generateCardType(type: string) {
  console.log(`🎯 Generando cartas de tipo: ${type}`);
  
  switch (type.toLowerCase()) {
    case 'bronze':
    case 'bronce':
      await createBronzeKnights();
      break;
    case 'silver':
    case 'plata':
      await createSilverKnights();
      break;
    case 'gold':
    case 'oro':
    case 'dorado':
      await createGoldKnights();
      break;
    case 'techniques':
    case 'tecnicas':
      await createTechniques();
      break;
    case 'objects':
    case 'objetos':
      await createObjects();
      break;
    case 'scenarios':
    case 'escenarios':
      await createScenarios();
      break;
    default:
      console.error(`❌ Tipo de carta no reconocido: ${type}`);
      console.log('Tipos disponibles: bronze, silver, gold, techniques, objects, scenarios');
  }
}