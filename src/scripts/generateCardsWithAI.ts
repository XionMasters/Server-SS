// src/scripts/generateCardsWithAI.ts
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import '../models/associations'; // Importar asociaciones
import { CardImageGenerator } from '../utils/cardImageGenerator';
import aiArtService from '../services/aiArtService';
import path from 'path';
import fs from 'fs';

interface GenerationOptions {
  generateAIArt: boolean;
  onlyMissingArt: boolean;
  cardTypes?: string[];
  rarities?: string[];
}

async function generateCardsWithAI(options: GenerationOptions = { generateAIArt: true, onlyMissingArt: true }) {
  try {
    console.log('🎨 ========================================');
    console.log('🎨 GENERADOR DE CARTAS CON IA');
    console.log('🎨 ========================================\n');
    
    // Conectar a la base de datos
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');
    
    // Configurar filtros
    const whereClause: any = {};
    if (options.cardTypes && options.cardTypes.length > 0) {
      whereClause.type = options.cardTypes;
    }
    if (options.rarities && options.rarities.length > 0) {
      whereClause.rarity = options.rarities;
    }

    // Obtener todas las cartas
    const cards = await Card.findAll({
      where: whereClause,
      include: [
        {
          model: CardKnight,
          as: 'card_knight',
          required: false
        }
      ]
    });

    console.log(`📊 Encontradas ${cards.length} cartas para procesar\n`);

    const generator = new CardImageGenerator();
    const outputDir = path.join(__dirname, '../assets/generated-cards');
    const aiArtDir = path.join(__dirname, '../assets/ai-generated-art');

    // Crear directorios si no existen
    [outputDir, aiArtDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    let successCount = 0;
    let errorCount = 0;
    let aiGeneratedCount = 0;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      console.log(`\n[${i + 1}/${cards.length}] Procesando: ${card.name}`);
      console.log(`   Tipo: ${card.type} | Rareza: ${card.rarity}`);

      try {
        const fileName = card.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        let artPath: string | undefined = undefined;

        // Generar arte con IA si está habilitado
        if (options.generateAIArt) {
          const aiArtPath = path.join(aiArtDir, `${fileName}.png`);
          
          // Solo generar si no existe o si no estamos en modo "only missing"
          if (!options.onlyMissingArt || !fs.existsSync(aiArtPath)) {
            console.log('   🤖 Generando arte con IA...');
            
            try {
              const knight = (card as any).card_knight;
              
              artPath = await aiArtService.generateArt({
                characterName: card.name,
                cardType: card.type,
                rarity: card.rarity,
                description: card.description || undefined,
                constellation: knight?.constellation,
                rank: knight?.rank
              });
              
              aiGeneratedCount++;
              console.log('   ✅ Arte generado con IA');
              
              // Esperar un poco para no saturar la API
              await sleep(3000);
              
            } catch (aiError: any) {
              console.log(`   ⚠️  Error generando arte con IA: ${aiError.message}`);
              console.log('   ℹ️  Continuando con placeholder...');
            }
          } else {
            artPath = aiArtPath;
            console.log('   ♻️  Usando arte existente');
          }
        }

        // Preparar datos de la carta
        const cardData: any = {
          name: card.name,
          type: card.type,
          rarity: card.rarity,
          cost: card.cost,
          description: card.description || '',
          faction: card.faction || 'Neutral',
          artPath: artPath
        };

        // Agregar estadísticas si es caballero
        if (card.type === 'caballero' && (card as any).card_knight) {
          const knight = (card as any).card_knight;
          cardData.attack = knight.attack;
          cardData.defense = knight.defense;
          cardData.health = knight.health;
          cardData.constellation = knight.constellation;
          cardData.rank = knight.rank;
        }

        // Generar imagen final de la carta
        console.log('   🎴 Componiendo carta final...');
        const outputPath = path.join(outputDir, `${fileName}.png`);
        await generator.saveCardImage(cardData, outputPath);
        
        // Actualizar URL de imagen en la base de datos
        await card.update({ 
          image_url: `/assets/generated-cards/${fileName}.png` 
        });

        successCount++;
        console.log(`   ✅ Carta completada: ${fileName}.png`);

      } catch (error: any) {
        console.error(`   ❌ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n🎉 ========================================');
    console.log('🎉 GENERACIÓN COMPLETADA');
    console.log('🎉 ========================================');
    console.log(`✅ Cartas exitosas: ${successCount}`);
    console.log(`🤖 Artes con IA generados: ${aiGeneratedCount}`);
    console.log(`❌ Errores: ${errorCount}`);
    console.log('🎉 ========================================\n');

  } catch (error: any) {
    console.error('❌ Error fatal en el proceso:', error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Comandos de ejecución
if (require.main === module) {
  const args = process.argv.slice(2);
  
  const options: GenerationOptions = {
    generateAIArt: !args.includes('--no-ai'),
    onlyMissingArt: !args.includes('--regenerate-all'),
    cardTypes: undefined,
    rarities: undefined
  };

  // Filtros opcionales
  const typeIndex = args.indexOf('--types');
  if (typeIndex !== -1 && args[typeIndex + 1]) {
    options.cardTypes = args[typeIndex + 1].split(',');
  }

  const rarityIndex = args.indexOf('--rarities');
  if (rarityIndex !== -1 && args[rarityIndex + 1]) {
    options.rarities = args[rarityIndex + 1].split(',');
  }

  console.log('\n⚙️  Configuración:');
  console.log(`   IA habilitada: ${options.generateAIArt}`);
  console.log(`   Solo arte faltante: ${options.onlyMissingArt}`);
  if (options.cardTypes) console.log(`   Tipos: ${options.cardTypes.join(', ')}`);
  if (options.rarities) console.log(`   Raridades: ${options.rarities.join(', ')}`);
  console.log('');

  generateCardsWithAI(options);
}

export default generateCardsWithAI;
