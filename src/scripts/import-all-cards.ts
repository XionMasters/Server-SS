// Script para importar todas las cartas desde las carpetas de assets
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import fs from 'fs';
import path from 'path';

// Mapeo de carpetas a configuración de cartas
interface FolderConfig {
  type: 'caballero' | 'tecnica' | 'objeto' | 'escenario' | 'ayudante' | 'ocasion';
  element?: 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null;
  rank?: 'bronze' | 'silver' | 'gold' | 'legendary' | 'steel' | 'black' | 'sapuri' | 'sonata';
  faction?: string;
}

const FOLDER_CONFIGS: Record<string, FolderConfig> = {
  'assistant': { type: 'ayudante', element: null },
  'black': { type: 'caballero', element: 'dark', rank: 'black', faction: 'Black Saints' },
  'bronzes': { type: 'caballero', element: null, rank: 'bronze', faction: 'Athena' },
  'golds': { type: 'caballero', element: null, rank: 'gold', faction: 'Athena' },
  'legendary': { type: 'caballero', element: null, rank: 'legendary', faction: 'Athena' },
  'object': { type: 'objeto', element: null },
  'occasion': { type: 'ocasion', element: null },
  'sapuris': { type: 'caballero', element: null, rank: 'sapuri', faction: 'Athena' },
  'silver': { type: 'caballero', element: null, rank: 'silver', faction: 'Athena' },
  'sonata': { type: 'caballero', element: null, rank: 'sonata', faction: 'Athena' },
  'stage': { type: 'escenario', element: null },
  'steel': { type: 'caballero', element: 'steel', rank: 'steel', faction: 'Asgard' },
  'technique': { type: 'tecnica', element: null },
  'tokens': { type: 'objeto', element: null }, // Tokens como objetos especiales
};

// Mapeo de rareza según el rango
function getRarityByRank(rank?: string): 'comun' | 'rara' | 'epica' | 'legendaria' {
  switch (rank) {
    case 'bronze':
    case 'steel':
      return 'comun';
    case 'silver':
    case 'black':
      return 'rara';
    case 'gold':
    case 'sapuri':
    case 'sonata':
      return 'epica';
    case 'legendary':
      return 'legendaria';
    default:
      return 'comun';
  }
}

// Mapeo de costo según rareza
function getCostByRarity(rarity: string): number {
  switch (rarity) {
    case 'comun':
      return 1;
    case 'rara':
      return 2;
    case 'epica':
      return 3;
    case 'legendaria':
      return 4;
    default:
      return 1;
  }
}

// Mapeo de stats base según rareza para caballeros
function getBaseStatsByRarity(rarity: string): { attack: number; defense: number; health: number; cosmos: number } {
  switch (rarity) {
    case 'comun':
      return { attack: 2, defense: 2, health: 4, cosmos: 0 };
    case 'rara':
      return { attack: 3, defense: 3, health: 6, cosmos: 0 };
    case 'epica':
      return { attack: 4, defense: 4, health: 8, cosmos: 0 };
    case 'legendaria':
      return { attack: 5, defense: 5, health: 10, cosmos: 0 };
    default:
      return { attack: 2, defense: 2, health: 4, cosmos: 0 };
  }
}

// Limpiar nombre de archivo para crear nombre de carta
function cleanFileName(fileName: string): string {
  // Remover extensión
  let name = fileName.replace(/\.(webp|png|jpg|jpeg)$/i, '');
  
  // Remover números entre paréntesis (duplicados)
  name = name.replace(/\s*\(\d+\)$/g, '');
  
  // Si es solo un número (con posibles espacios), retornar null
  if (/^\d+\s*$/.test(name.trim())) {
    return '';
  }
  
  // Reemplazar guiones bajos por espacios
  name = name.replace(/_/g, ' ');
  
  // Capitalizar cada palabra
  name = name.split(' ').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
  
  return name.trim();
}

async function importCardsFromFolder(folderName: string, config: FolderConfig) {
  const assetsPath = path.join(__dirname, '../assets', folderName);
  
  if (!fs.existsSync(assetsPath)) {
    console.log(`⚠️  Carpeta no encontrada: ${folderName}`);
    return { imported: 0, skipped: 0 };
  }

  const files = fs.readdirSync(assetsPath);
  const imageFiles = files.filter(f => /\.(webp|png|jpg|jpeg)$/i.test(f));
  
  console.log(`\n📁 Procesando carpeta: ${folderName} (${imageFiles.length} archivos)`);
  
  let imported = 0;
  let skipped = 0;
  const processedImages = new Set<string>();

  for (const file of imageFiles) {
    const cleanName = cleanFileName(file);
    const imageUrl = `/assets/${folderName}/${file}`;
    
    // Si el nombre está vacío (era solo un número), saltar
    if (!cleanName) {
      skipped++;
      continue;
    }
    
    // Evitar duplicados por URL de imagen
    if (processedImages.has(imageUrl)) {
      console.log(`  ⏭️  Saltando duplicado por imagen: ${file}`);
      skipped++;
      continue;
    }
    
    processedImages.add(imageUrl);
    
    // Verificar si ya existe en la base de datos por imagen
    const existing = await Card.findOne({ where: { image_url: imageUrl } });
    if (existing) {
      console.log(`  ⏭️  Ya existe: ${cleanName}`);
      skipped++;
      continue;
    }
    
    const rarity = getRarityByRank(config.rank);
    const cost = getCostByRarity(rarity);
    
    // Crear la carta
    const card = await Card.create({
      name: cleanName,
      type: config.type,
      rarity: rarity,
      cost: cost,
      description: `${cleanName} - Importado desde ${folderName}`,
      image_url: imageUrl,
      faction: config.faction || null,
      element: config.element || null,
    });
    
    // Si es caballero, crear stats
    if (config.type === 'caballero') {
      const stats = getBaseStatsByRarity(rarity);
      await CardKnight.create({
        card_id: card.id,
        attack: stats.attack,
        defense: stats.defense,
        health: stats.health,
        cosmos: stats.cosmos,
      });
    }
    
    console.log(`  ✅ Importado: ${cleanName} (${rarity})`);
    imported++;
  }
  
  return { imported, skipped };
}

async function main() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');
    
    let totalImported = 0;
    let totalSkipped = 0;
    
    // Procesar cada carpeta
    for (const [folderName, config] of Object.entries(FOLDER_CONFIGS)) {
      const result = await importCardsFromFolder(folderName, config);
      totalImported += result.imported;
      totalSkipped += result.skipped;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`🎉 Importación completada`);
    console.log(`✅ Cartas importadas: ${totalImported}`);
    console.log(`⏭️  Cartas saltadas (duplicadas o existentes): ${totalSkipped}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en la importación:', error);
    process.exit(1);
  }
}

main();
