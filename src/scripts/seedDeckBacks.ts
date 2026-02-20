import { sequelize } from '../config/database';
import DeckBack from '../models/DeckBack';

async function seedDeckBacks() {
  try {
    console.log('🎴 Iniciando seed de dorsos de mazo...');

    await sequelize.sync();

    // Verificar si ya existen
    const existingCount = await DeckBack.count();
    if (existingCount > 0) {
      console.log(`✅ Ya existen ${existingCount} dorsos, omitiendo seed`);
      return;
    }

    const deckBacks: Array<{
      name: string;
      image_url: string;
      unlock_type: 'default' | 'achievement' | 'purchase' | 'seasonal';
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      is_active: boolean;
    }> = [
      {
        name: 'Dorso Clásico',
        image_url: '/assets/cards/card_back.png',
        unlock_type: 'default',
        rarity: 'common',
        is_active: true
      },
      {
        name: 'Dorso Dorado',
        image_url: '/assets/deck-backs/golden.png',
        unlock_type: 'purchase',
        rarity: 'rare',
        is_active: true
      },
      {
        name: 'Dorso Legendario',
        image_url: '/assets/deck-backs/legendary.png',
        unlock_type: 'achievement',
        rarity: 'legendary',
        is_active: true
      }
    ];

    await DeckBack.bulkCreate(deckBacks);

    console.log(`✅ ${deckBacks.length} dorsos creados correctamente`);
  } catch (error) {
    console.error('❌ Error en seed de dorsos:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

seedDeckBacks();
