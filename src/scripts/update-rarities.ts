// Script para actualizar rarezas manualmente
// Crea un archivo rarity-mapping.json con el formato:
// { "image_url": "rarity" }
import { sequelize } from '../config/database';
import Card from '../models/Card';
import fs from 'fs';
import path from 'path';

interface RarityMapping {
  [image_url: string]: 'comun' | 'rara' | 'epica' | 'legendaria' | 'divina';
}

async function updateRarities() {
  try {
    await sequelize.authenticate();
    console.log('🔄 Conectando a la base de datos...\n');
    
    const mappingPath = path.join(__dirname, 'rarity-mapping.json');
    
    if (!fs.existsSync(mappingPath)) {
      console.log('⚠️  No se encontró el archivo rarity-mapping.json');
      console.log('📝 Creando archivo de ejemplo...\n');
      
      const exampleMapping: RarityMapping = {
        "/assets/golds/1.webp": "epica",
        "/assets/legendary/1.webp": "legendaria",
        "/assets/bronzes/1.webp": "comun",
        "/assets/steel/1.webp": "rara"
      };
      
      fs.writeFileSync(mappingPath, JSON.stringify(exampleMapping, null, 2));
      console.log('✅ Archivo rarity-mapping.json creado con ejemplos');
      console.log('📋 Formato:');
      console.log('   "/assets/carpeta/archivo.webp": "rareza"');
      console.log('\n📌 Rarezas disponibles:');
      console.log('   - comun (bronce)');
      console.log('   - rara (plata)');
      console.log('   - epica (oro)');
      console.log('   - legendaria (rojo/especial)');
      console.log('   - divina (dioses)\n');
      console.log('📝 Edita el archivo y vuelve a ejecutar este script\n');
      process.exit(0);
    }
    
    const mapping: RarityMapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    
    let updatedCount = 0;
    let notFoundCount = 0;
    
    for (const [imageUrl, rarity] of Object.entries(mapping)) {
      const card = await Card.findOne({ where: { image_url: imageUrl } });
      
      if (!card) {
        console.log(`⚠️  Carta no encontrada: ${imageUrl}`);
        notFoundCount++;
        continue;
      }
      
      const oldRarity = card.rarity;
      card.rarity = rarity as any;
      await card.save();
      
      console.log(`✅ Actualizado: ${card.name}`);
      console.log(`   ${oldRarity} → ${rarity}`);
      updatedCount++;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Actualización de rarezas completada');
    console.log(`✅ Cartas actualizadas: ${updatedCount}`);
    console.log(`⚠️  Cartas no encontradas: ${notFoundCount}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateRarities();
