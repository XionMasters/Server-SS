import { sequelize } from './src/config/database';

async function checkUserCards() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');

    const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';
    
    // Query directa para obtener el usuario y sus cartas
    const query = `
      SELECT 
        u.id,
        u.username,
        u.currency,
        COUNT(DISTINCT uc.card_id) as unique_cards,
        COALESCE(SUM(uc.quantity), 0) as total_copies,
        json_agg(json_build_object('card_id', uc.card_id, 'quantity', uc.quantity)) as cards
      FROM users u
      LEFT JOIN user_cards uc ON u.id = uc.user_id
      WHERE u.id = :userId
      GROUP BY u.id, u.username, u.currency
    `;

    const result: any = await sequelize.query(query, {
      replacements: { userId },
      type: 'SELECT',
    });

    if (!result || result.length === 0) {
      console.log('❌ Usuario no encontrado');
      await sequelize.close();
      return;
    }

    const data = result[0];
    console.log(`👤 Usuario: ${data.username}`);
    console.log(`📊 Estadísticas:`);
    console.log(`   - Cartas únicas: ${data.unique_cards}`);
    console.log(`   - Total de copias: ${data.total_copies}`);
    console.log(`   - Oro disponible: ${data.currency}`);
    
    const cards = data.cards || [];
    console.log(`\n📋 Primeras 15 cartas:`);

    const distribution: { [key: number]: number } = {};
    for (let i = 0; i < Math.min(15, cards.length); i++) {
      const card = cards[i];
      console.log(`   ${i + 1}. Card ${card.card_id}: ${card.quantity} copia(s)`);
      distribution[card.quantity] = (distribution[card.quantity] || 0) + 1;
    }
    if (cards.length > 15) {
      console.log(`   ... y ${cards.length - 15} más`);
    }

    console.log(`\n📈 Distribución de cantidades:`);
    Object.keys(distribution)
      .sort((a, b) => parseInt(a) - parseInt(b))
      .forEach(qty => {
        console.log(`   - ${distribution[parseInt(qty)]} carta(s) con ${qty} copia(s)`);
      });

    console.log(`\n✅ Este usuario tiene ${data.total_copies} cartas disponibles para construir mazos.`);
    if (data.total_copies >= 40) {
      console.log(`✅ Suficientes cartas para generar un mazo de 40+ cartas.`);
    } else {
      console.log(`⚠️  NO suficientes cartas (se necesitan mínimo 40).`);
    }

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserCards();
