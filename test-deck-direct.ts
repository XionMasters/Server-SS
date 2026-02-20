// Direct test of deck generation logic
import { sequelize } from './src/config/database';
import Deck from './src/models/Deck';
import UserCard from './src/models/UserCard';
import { generateAndSaveDeck } from './src/utils/deckGenerator';
import './src/models/associations';

async function testDeckGen() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a BD\n');

    const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';

    // Get user cards with quantities
    const userCards = await UserCard.findAll({
      where: { user_id: userId },
      attributes: ['card_id', 'quantity']
    });

    console.log(`📊 Cartas del usuario:`);
    console.log(`   - Únicas: ${userCards.length}`);
    console.log(`   - Totales: ${userCards.reduce((sum, uc: any) => sum + (uc.quantity || 1), 0)}`);
    console.log(`\n`);

    // Get or create a test deck
    const deck = await Deck.findOne({ where: { user_id: userId } });
    if (!deck) {
      console.log('❌ Usuario no tiene mazos');
      await sequelize.close();
      return;
    }

    console.log(`🎴 Usando mazo: ${deck.name} (ID: ${deck.id})\n`);

    // Prepare card data for generator
    const userCardData = userCards.map((uc: any) => ({
      card_id: uc.card_id,
      quantity: uc.quantity || 1
    }));

    console.log('🔄 Generando mazo con la estrategia balanceada...\n');

    // Call generator directly
    const result = await generateAndSaveDeck(userId, deck.id, userCardData, {
      strategy: 'balanced',
      targetCards: 45,
      maxLegendaries: 5
    });

    console.log(`\n✅ Resultado:`);
    console.log(`   - Cartas generadas: ${result.cards.length}`);
    console.log(`   - Cartas totales: ${result.stats.total_cards}`);
    console.log(`   - Por tipo: ${JSON.stringify(result.stats.by_type)}`);
    console.log(`   - Por rareza: ${JSON.stringify(result.stats.by_rarity)}`);

    await sequelize.close();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testDeckGen();
