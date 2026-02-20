import { sequelize } from './src/config/database';
import Card from './src/models/Card';
import UserCard from './src/models/UserCard';

async function debugTechniqueTypes() {
  try {
    await sequelize.authenticate();
    
    const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';
    
    // Get user's cards
    const userCards = await UserCard.findAll({
      where: { user_id: userId },
      attributes: ['card_id', 'quantity'],
      raw: true
    }) as any[];
    
    const cardIds = userCards.map((uc: any) => uc.card_id);
    
    // Get full card details
    const cards = await Card.findAll({
      where: { id: cardIds },
      attributes: ['id', 'name', 'type', 'rarity'],
      raw: true
    }) as any[];
    
    console.log('\n📊 Cards por tipo:\n');
    
    const byType: { [key: string]: any[] } = {};
    cards.forEach((card: any) => {
      if (!byType[card.type]) byType[card.type] = [];
      byType[card.type].push(card);
    });
    
    Object.entries(byType).forEach(([type, cardsOfType]) => {
      console.log(`${type}: ${cardsOfType.length} cartas`);
      cardsOfType.forEach((card: any) => {
        const userCard = userCards.find((uc: any) => uc.card_id === card.id);
        console.log(`  - ${card.name} (${userCard?.quantity || 1}x)`);
      });
      console.log('');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugTechniqueTypes();
