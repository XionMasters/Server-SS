import Card from './src/models/Card';

async function checkExactTypes() {
  try {
    const techniquCards = await Card.findAll({
      where: { type: ['tecnica', 'técnica'] },
      attributes: ['id', 'name', 'type'],
      limit: 5,
      raw: true
    }) as any[];
    
    console.log('\n🔍 Técnicas encontradas:\n');
    techniquCards.forEach((card: any) => {
      console.log(`Type: "${card.type}" | Name: ${card.name}`);
      console.log(`  Type bytes: ${Buffer.from(card.type).toString('hex')}`);
    });
    
    // Check occasions
    const occasionCards = await Card.findAll({
      where: { type: ['ocasion', 'ocasión'] },
      attributes: ['id', 'name', 'type'],
      limit: 5,
      raw: true
    }) as any[];
    
    console.log('\n🔍 Ocasiones encontradas:\n');
    occasionCards.forEach((card: any) => {
      console.log(`Type: "${card.type}" | Name: ${card.name}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkExactTypes();
