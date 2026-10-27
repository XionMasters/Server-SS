import { connectDatabase } from '../../src/config/database';
import CardInPlay from '../../src/infrastructure/database/models/CardInPlay';

async function checkCards() {
  try {
    await connectDatabase();
    
    const count = await CardInPlay.count();
    console.log(`✅ Total CardInPlay en BD: ${count}`);
    
    if (count > 0) {
      const sample = await CardInPlay.findAll({ limit: 5 });
      console.log('📋 Primeras cartas:', JSON.stringify(sample, null, 2));
    } else {
      console.log('❌ No hay cartas en CardInPlay');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkCards();
