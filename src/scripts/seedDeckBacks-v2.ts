import { sequelize } from '../config/database';
import DeckBack from '../models/DeckBack';

/**
 * Script de seed mejorado para dorsos de mazo
 * Define claramente cuál es default, cuáles son para compra y cuáles para logros
 */

async function seedDeckBacks() {
  try {
    console.log('🎴 Iniciando seed de dorsos de mazo...\n');

    await sequelize.sync();

    // Eliminar dorsos existentes
    const existingCount = await DeckBack.count();
    if (existingCount > 0) {
      const deleted = await DeckBack.destroy({ where: {} });
      console.log(`🗑️  Se eliminaron ${deleted} dorsos existentes\n`);
    }

    // Definición clara de dorsos: DEFAULT → LOGROS → COMPRA → SEASONAL
    const deckBacks: Array<{
      name: string;
      image_url: string;
      unlock_type: 'default' | 'achievement' | 'purchase' | 'seasonal';
      rarity: 'common' | 'rare' | 'epic' | 'legendary';
      is_active: boolean;
    }> = [
      // 🔓 DEFAULT - Disponible para todos desde el inicio
      {
        name: 'Dorso Clásico',
        image_url: '/assets/cards/card_back.png',
        unlock_type: 'default',
        rarity: 'common',
        is_active: true
      },

      // 🏆 LOGROS - Se desbloquean por alcanzar hitos en el juego
      {
        name: 'Dorso Cósmico',
        image_url: '/assets/deck-backs/cosmic.png',
        unlock_type: 'achievement',
        rarity: 'epic',
        is_active: true
      },
      {
        name: 'Dorso Legendario Divino',
        image_url: '/assets/deck-backs/divine_legendary.png',
        unlock_type: 'achievement',
        rarity: 'legendary',
        is_active: true
      },

      // 💰 COMPRA - Se compran con monedas del juego o dinero real
      {
        name: 'Dorso Dorado',
        image_url: '/assets/deck-backs/golden.png',
        unlock_type: 'purchase',
        rarity: 'rare',
        is_active: true
      },
      {
        name: 'Dorso Celestial',
        image_url: '/assets/deck-backs/celestial.png',
        unlock_type: 'purchase',
        rarity: 'rare',
        is_active: true
      },

      // 🏛️  SEASONAL - Temática del Santuario de Atenea
      {
        name: 'Arma de Atenea',
        image_url: '/assets/deck-backs/athena_weapon.png',
        unlock_type: 'seasonal',
        rarity: 'common',
        is_active: true
      },
      {
        name: 'El Santuario',
        image_url: '/assets/deck-backs/sanctuary.png',
        unlock_type: 'seasonal',
        rarity: 'common',
        is_active: true
      },
      {
        name: 'Caballero del Santuario',
        image_url: '/assets/deck-backs/sanctuary_knight.png',
        unlock_type: 'seasonal',
        rarity: 'common',
        is_active: true
      }
    ];

    await DeckBack.bulkCreate(deckBacks);

    console.log('✅ Dorsos creados correctamente!\n');
    console.log('📊 Resumen por categoría:\n');

    console.log('🔓 DEFAULT (Acceso inmediato):');
    deckBacks
      .filter(db => db.unlock_type === 'default')
      .forEach(db => console.log(`   • ${db.name} (${db.rarity})`));

    console.log('\n🏆 LOGROS (Se desbloquean jugando):');
    deckBacks
      .filter(db => db.unlock_type === 'achievement')
      .forEach(db => console.log(`   • ${db.name} (${db.rarity})`));

    console.log('💰 COMPRA (Disponibles en tienda):');
    deckBacks
      .filter(db => db.unlock_type === 'purchase')
      .forEach(db => console.log(`   • ${db.name} (${db.rarity})`));

    console.log('\n🏛️  SEASONAL (Temática del Santuario):');
    deckBacks
      .filter(db => db.unlock_type === 'seasonal')
      .forEach(db => console.log(`   • ${db.name} (${db.rarity})`));

    console.log('\n');
  } catch (error) {
    console.error('❌ Error en seed de dorsos:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

seedDeckBacks();
