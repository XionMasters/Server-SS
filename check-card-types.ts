import { sequelize } from './src/config/database';
import UserCard from './src/models/UserCard';
import Card from './src/models/Card';
import './src/models/associations';

async function checkCardTypes() {
  try {
    await sequelize.authenticate();
    const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';

    const userCards = await UserCard.findAll({
      where: { user_id: userId },
      attributes: ['card_id', 'quantity'],
      include: [{
        model: Card,
        as: 'card',
        attributes: ['name', 'type', 'rarity'],
        required: true
      }]
    });

    const byType: { [key: string]: { count: number, totalCopies: number } } = {};
    const byRarity: { [key: string]: { count: number, totalCopies: number } } = {};

    for (const uc of userCards) {
      const card = (uc as any).card;
      const type = card.type || 'unknown';
      const rarity = card.rarity || 'unknown';

      if (!byType[type]) byType[type] = { count: 0, totalCopies: 0 };
      if (!byRarity[rarity]) byRarity[rarity] = { count: 0, totalCopies: 0 };

      byType[type].count++;
      byType[type].totalCopies += uc.quantity;
      byRarity[rarity].count++;
      byRarity[rarity].totalCopies += uc.quantity;
    }

    console.log('📊 Distribución de cartas por tipo:');
    for (const [type, data] of Object.entries(byType)) {
      console.log(`   ${type}: ${data.count} únicas, ${data.totalCopies} totales`);
    }

    console.log('\n📊 Distribución de cartas por rareza:');
    for (const [rarity, data] of Object.entries(byRarity)) {
      console.log(`   ${rarity}: ${data.count} únicas, ${data.totalCopies} totales`);
    }

    console.log(`\n💡 Total posible en mazo (respetando límites de rareza):`);
    let maxPossible = 0;

    // Legendaria: 1 copia máximo → solo 1
    maxPossible += Math.min((byRarity['legendary']?.totalCopies || 0), 1);

    // Épica: 1 copia máximo → solo 1
    maxPossible += Math.min((byRarity['epic']?.totalCopies || 0), 1);

    // Rara: 2 copias máximo
    const raroTotal = (byRarity['rare']?.totalCopies || 0);
    maxPossible += Math.min(raroTotal, 2 * (byRarity['rare']?.count || 1));

    // Común: 3 copias por carta
    const comunTotal = (byRarity['common']?.totalCopies || 0);
    maxPossible += Math.min(comunTotal, 3 * (byRarity['common']?.count || 1));

    console.log(`   Estimado: ${maxPossible} cartas (respetando límites por rareza)`);
    console.log(`   Totales sin límites: ${userCards.reduce((sum, uc) => sum + uc.quantity, 0)} cartas`);

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCardTypes();
