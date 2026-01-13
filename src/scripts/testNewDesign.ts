import sequelize from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import '../models/associations';
import { CardImageGeneratorV2 } from '../utils/cardImageGeneratorV2';
import path from 'path';
import fs from 'fs';

async function testNewDesign() {
  try {
    console.log('🔌 Conectando a la base de datos...');
    await sequelize.authenticate();

    console.log('🔍 Buscando cartas de prueba...');
    const testCards = await Card.findAll({
      where: {
        name: ['Seiya de Pegaso', 'Shiryu de Dragón', 'Aldebarán de Tauro']
      },
      include: [{ model: CardKnight, as: 'card_knight' }]
    });

    if (testCards.length === 0) {
      console.error('❌ No se encontraron cartas de prueba');
      process.exit(1);
    }

    console.log(`✅ Encontradas ${testCards.length} cartas para prueba\n`);

    const generator = new CardImageGeneratorV2();
    const outputDir = path.join(__dirname, '../assets/generated-cards/v2-test');

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const card of testCards) {
      console.log(`🎴 Generando: ${card.name}`);
      console.log(`   📊 Rareza: ${card.rarity}`);

      // Buscar arte existente
      const artDir = path.join(__dirname, '../assets/ai-generated-art');
      const artFileName = card.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      const artPath = path.join(artDir, `${artFileName}.png`);

      const cardBuffer = await generator.generateCardImage({
        name: card.name,
        type: 'caballero',
        rarity: card.rarity,
        cost: (card as any).card_knight?.cosmos || 0,
        attack: (card as any).card_knight?.attack || 0,
        defense: (card as any).card_knight?.defense || 0,
        health: (card as any).card_knight?.health || 0,
        description: card.description || 'Caballero de Athena protector de la justicia',
        faction: card.faction || 'Athena',
        artPath: fs.existsSync(artPath) ? artPath : undefined,
        constellation: (card as any).card_knight?.constellation,
        rank: (card as any).card_knight?.rank
      });

      const outputPath = path.join(outputDir, `${artFileName}-v2.png`);
      fs.writeFileSync(outputPath, cardBuffer);

      console.log(`   ✅ Guardada: ${outputPath}\n`);
    }

    console.log(`\n🎉 ¡Generación de prueba completada!`);
    console.log(`📂 Revisa las cartas en: ${outputDir}`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

testNewDesign();
