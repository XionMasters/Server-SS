import sequelize from '../config/database';
import Card from '../infrastructure/database/models/Card';
import CardKnight from '../infrastructure/database/models/CardKnight';
import '../infrastructure/database/models/associations';
import { AIArtService } from '../infrastructure/ai-art/aiArtService';
import { CardImageGenerator } from '../infrastructure/assets/cardImageGenerator';
import path from 'path';
import fs from 'fs';

async function testShunWithHuggingFace() {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await sequelize.authenticate();

    console.log('🔍 Buscando a Shun de Andrómeda...');
    const shun = await Card.findOne({
      where: { name: 'Shun de Andrómeda' },
      include: [{ model: CardKnight, as: 'card_knight' }]
    });

    if (!shun) {
      console.error('❌ Shun no encontrado en la DB');
      process.exit(1);
    }

    console.log(`✅ Encontrado: ${shun.name}`);
    console.log(`📊 Rarity: ${shun.rarity}`);
    console.log(`🎨 Generando arte SOLO con Hugging Face...\n`);

    const aiService = new AIArtService();
    
    // Forzar uso de Hugging Face directamente
    const artPath = await aiService.generateWithHuggingFace({
      characterName: shun.name,
      description: shun.description || '',
      cardType: 'caballero',
      rarity: shun.rarity
    });

    console.log(`\n✅ Arte generado con Hugging Face: ${artPath}`);
    console.log('🎴 Generando carta completa...');

    const generator = new CardImageGenerator();
    const cardBuffer = await generator.generateCardImage({
      name: shun.name,
      type: 'caballero',
      rarity: shun.rarity,
      cost: (shun as any).card_knight?.cosmos_cost || 0,
      attack: (shun as any).card_knight?.attack || 0,
      defense: (shun as any).card_knight?.defense || 0,
      health: (shun as any).card_knight?.health || 0,
      description: shun.description || '',
      faction: shun.faction || 'Athena',
      artPath: artPath,
      constellation: (shun as any).card_knight?.constellation,
      rank: (shun as any).card_knight?.rank
    });

    const outputPath = path.join(__dirname, '../assets/generated-cards/shun-hf-test.png');
    fs.writeFileSync(outputPath, cardBuffer);

    console.log(`\n🎉 ¡CARTA DE SHUN COMPLETADA CON HUGGING FACE!`);
    console.log(`📂 Arte IA: ${artPath}`);
    console.log(`📂 Carta final: ${outputPath}`);

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('📄 Response status:', error.response.status);
      console.error('📄 Response data:', error.response.data);
    }
    throw error;
  } finally {
    await sequelize.close();
  }
}

testShunWithHuggingFace();
