import sequelize from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import '../models/associations';
import { AIArtService } from '../services/aiArtService';
import { CardImageGenerator } from '../utils/cardImageGenerator';
import path from 'path';
import fs from 'fs';

async function testSingleCard() {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await sequelize.authenticate();

    console.log('🔍 Buscando a Seiya...');
    const seiya = await Card.findOne({
      where: { name: 'Seiya de Pegaso' },
      include: [{ model: CardKnight, as: 'card_knight' }]
    });

    if (!seiya) {
      console.error('❌ Seiya no encontrado en la DB');
      process.exit(1);
    }

    console.log(`✅ Encontrado: ${seiya.name}`);
    console.log('🎨 Generando arte con IA...\n');

    const aiService = new AIArtService();
    const artPath = await aiService.generateArt({
      characterName: seiya.name,
      description: seiya.description || '',
      cardType: 'caballero',
      rarity: seiya.rarity
    });

    console.log(`\n✅ Arte generado: ${artPath}`);
    console.log('🎴 Generando carta completa...');

    const generator = new CardImageGenerator();
    const cardBuffer = await generator.generateCardImage({
      name: seiya.name,
      type: 'caballero',
      rarity: seiya.rarity,
      cost: (seiya as any).card_knight?.cosmos_cost || 0,
      attack: (seiya as any).card_knight?.attack || 0,
      defense: (seiya as any).card_knight?.defense || 0,
      health: (seiya as any).card_knight?.health || 0,
      description: seiya.description || '',
      faction: seiya.faction || 'Athena',
      artPath: artPath,
      constellation: (seiya as any).card_knight?.constellation,
      rank: (seiya as any).card_knight?.rank
    });

    const outputPath = path.join(__dirname, '../assets/generated-cards/seiya-test-ai.png');
    fs.writeFileSync(outputPath, cardBuffer);

    console.log(`\n🎉 ¡CARTA COMPLETADA!`);
    console.log(`📂 Imagen: ${outputPath}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

testSingleCard();
