import sequelize from '../config/database';
import Card from '../infrastructure/database/models/Card';
import CardKnight from '../infrastructure/database/models/CardKnight';
import '../infrastructure/database/models/associations';
import { CardImageGeneratorV2 } from '../infrastructure/assets/cardImageGeneratorV2';
import path from 'path';
import fs from 'fs';

async function testGoldKnight() {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await sequelize.authenticate();

    console.log('🔍 Buscando a Saga de Géminis...');
    const saga = await Card.findOne({
      where: { name: 'Saga de Géminis' },
      include: [{ model: CardKnight, as: 'card_knight' }]
    });

    if (!saga) {
      console.error('❌ Saga no encontrado');
      process.exit(1);
    }

    console.log(`✅ Encontrado: ${saga.name}`);
    console.log(`   📊 Rareza: ${saga.rarity}`);

    const generator = new CardImageGeneratorV2();
    const outputDir = path.join(__dirname, '../assets/generated-cards/v2-test');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Buscar arte existente
    const artDir = path.join(__dirname, '../assets/ai-generated-art');
    const artFileName = saga.name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const artPath = path.join(artDir, `${artFileName}.png`);

    console.log(`🎴 Generando carta dorada...`);

    const cardBuffer = await generator.generateCardImage({
      name: saga.name,
      type: 'caballero',
      rarity: saga.rarity,
      cost: (saga as any).card_knight?.cosmos || 0,
      attack: (saga as any).card_knight?.attack || 0,
      defense: (saga as any).card_knight?.defense || 0,
      health: (saga as any).card_knight?.health || 0,
      description: saga.description || 'Caballero Dorado de Athena, guardián del templo de Géminis',
      faction: saga.faction || 'Athena',
      artPath: fs.existsSync(artPath) ? artPath : undefined,
      constellation: (saga as any).card_knight?.constellation,
      rank: (saga as any).card_knight?.rank
    });

    const outputPath = path.join(outputDir, `${artFileName}-v2.png`);
    fs.writeFileSync(outputPath, cardBuffer);

    console.log(`\n✅ Carta dorada generada: ${outputPath}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

testGoldKnight();
