// src/scripts/generateCardImages.ts
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import { CardImageGenerator } from '../utils/cardImageGenerator';
import path from 'path';

async function generateImagesFromDatabase() {
  try {
    console.log('🎨 Iniciando generación de imágenes de cartas...');
    
    // Conectar a la base de datos
    await sequelize.authenticate();
    
    // Obtener todas las cartas
    const cards = await Card.findAll({
      include: [
        {
          model: CardKnight,
          required: false
        }
      ]
    });

    console.log(`📊 Encontradas ${cards.length} cartas en la base de datos`);

    const generator = new CardImageGenerator();
    const outputDir = path.join(__dirname, '../assets/generated-cards');

    let successCount = 0;
    let errorCount = 0;

    for (const card of cards) {
      try {
        const cardData: any = {
          name: card.name,
          type: card.type,
          rarity: card.rarity,
          cost: card.cost,
          description: card.description || '',
          faction: card.faction || 'Neutral'
        };

        // Agregar estadísticas si es caballero
        if (card.type === 'knight' && (card as any).CardKnight) {
          const knight = (card as any).CardKnight;
          cardData.attack = knight.attack;
          cardData.defense = knight.defense;
          cardData.health = knight.health;
        }

        // Generar nombre de archivo seguro
        const fileName = card.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');

        const outputPath = path.join(outputDir, `${fileName}.png`);
        
        await generator.saveCardImage(cardData, outputPath);
        successCount++;
        
        // Actualizar URL de imagen en la base de datos
        await card.update({ 
          image_url: `/assets/generated-cards/${fileName}.png` 
        });

      } catch (error) {
        console.error(`❌ Error generando imagen para ${card.name}:`, error);
        errorCount++;
      }
    }

    console.log(`🎉 Generación completada:`);
    console.log(`✅ Exitosas: ${successCount}`);
    console.log(`❌ Errores: ${errorCount}`);

  } catch (error) {
    console.error('❌ Error en el proceso de generación:', error);
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  generateImagesFromDatabase();
}

export default generateImagesFromDatabase;