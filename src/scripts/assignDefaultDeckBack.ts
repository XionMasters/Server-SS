import { sequelize } from '../config/database';
import DeckBack from '../models/DeckBack';
import Deck from '../models/Deck';
import UserDeckBackUnlock from '../models/UserDeckBackUnlock';
import User from '../models/User';

async function assignDefaultDeckBack() {
  try {
    console.log('🎴 Asignando dorso por defecto a barajas...');

    await sequelize.sync();

    // Obtener el dorso por defecto
    const defaultDeckBack = await DeckBack.findOne({
      where: { unlock_type: 'default', is_active: true }
    });

    if (!defaultDeckBack) {
      console.error('❌ No se encontró dorso por defecto. Ejecuta seedDeckBacks primero.');
      return;
    }

    console.log(`📍 Usando dorso por defecto: ${defaultDeckBack.name} (${defaultDeckBack.id})`);

    // Obtener todas las barajas
    const decks = await Deck.findAll();
    console.log(`📦 Encontradas ${decks.length} barajas`);

    let updated = 0;

    for (const deck of decks) {
      if (!deck.current_deck_back_id) {
        console.log(`  ℹ️ Asignando dorso a baraja ${deck.id}`);
        deck.current_deck_back_id = defaultDeckBack.id;
        await deck.save();
        updated++;
      }

      // Desbloquear dorso para el usuario si no lo tiene
      const hasUnlock = await UserDeckBackUnlock.findOne({
        where: {
          user_id: deck.user_id,
          deck_back_id: defaultDeckBack.id
        }
      });

      if (!hasUnlock) {
        await UserDeckBackUnlock.create({
          user_id: deck.user_id,
          deck_back_id: defaultDeckBack.id,
          unlock_source: 'initial_setup'
        });
      }
    }

    console.log(`✅ Asignación completada:`);
    console.log(`  - ${updated} barajas actualizadas`);
    console.log(`  - Dorsos desbloqueados para ${decks.length} usuarios`);

  } catch (error) {
    console.error('❌ Error asignando dorso por defecto:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

assignDefaultDeckBack();
