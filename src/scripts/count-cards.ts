// Script para contar cartas en la base de datos
import { sequelize } from '../config/database';
import Card from '../infrastructure/database/models/Card';
import CardKnight from '../infrastructure/database/models/CardKnight';

async function countCards() {
  try {
    await sequelize.authenticate();
    
    const totalCards = await Card.count();
    const totalKnights = await CardKnight.count();
    const cardsByType = await Card.findAll({
      attributes: ['type', [sequelize.fn('COUNT', sequelize.col('type')), 'count']],
      group: ['type'],
      raw: true
    });
    
    const cardsByRarity = await Card.findAll({
      attributes: ['rarity', [sequelize.fn('COUNT', sequelize.col('rarity')), 'count']],
      group: ['rarity'],
      raw: true
    });
    
    const cardsByElement = await Card.findAll({
      attributes: ['element', [sequelize.fn('COUNT', sequelize.col('element')), 'count']],
      group: ['element'],
      raw: true
    });
    
    console.log('\n📊 Estadísticas de cartas en la base de datos\n');
    console.log('='.repeat(60));
    console.log(`Total de cartas: ${totalCards}`);
    console.log(`Total de caballeros: ${totalKnights}`);
    console.log('='.repeat(60));
    
    console.log('\n📋 Por tipo:');
    cardsByType.forEach((item: any) => {
      console.log(`  ${item.type}: ${item.count}`);
    });
    
    console.log('\n✨ Por rareza:');
    cardsByRarity.forEach((item: any) => {
      console.log(`  ${item.rarity}: ${item.count}`);
    });
    
    console.log('\n🔮 Por elemento:');
    cardsByElement.forEach((item: any) => {
      const elementName = item.element || 'sin elemento';
      console.log(`  ${elementName}: ${item.count}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

countCards();
