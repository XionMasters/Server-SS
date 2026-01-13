import { Sequelize } from 'sequelize';

// DB Credentials
const sequelize = new Sequelize({
  database: 'SSTCGO',
  username: 'postgres',
  password: 'Apl1c4c10n3s.-.-',
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false
});

const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';

async function investigateUser() {
  try {
    console.log('🔍 Investigando usuario XionMasters...\n');

    // 1. Verificar si el usuario existe
    const userQuery = `
      SELECT id, username, email, created_at 
      FROM users 
      WHERE id = '${userId}'
    `;
    const [users] = await sequelize.query(userQuery);
    console.log('1️⃣ USUARIO:');
    if (users.length === 0) {
      console.log('   ❌ Usuario NO encontrado');
      process.exit(1);
    } else {
      console.log('   ✅ Usuario existe:', users[0]);
    }

    // 2. Verificar mazos
    console.log('\n2️⃣ MAZOS:');
    const decksQuery = `
      SELECT id, user_id, name, is_active, created_at 
      FROM decks 
      WHERE user_id = '${userId}'
    `;
    const [decks] = await sequelize.query(decksQuery);
    console.log(`   Total: ${decks.length} mazo(s)`);
    if (decks.length > 0) {
      decks.forEach((deck: any, idx: number) => {
        console.log(`   Mazo ${idx + 1}:`, {
          id: deck.id,
          name: deck.name,
          is_active: deck.is_active,
          created_at: deck.created_at
        });
      });
    } else {
      console.log('   ⚠️  Sin mazos asignados');
    }

    // 3. Verificar cartas del usuario
    console.log('\n3️⃣ CARTAS DEL USUARIO:');
    const userCardsQuery = `
      SELECT COUNT(*) as total
      FROM user_cards 
      WHERE user_id = '${userId}'
    `;
    const [userCardResult] = await sequelize.query(userCardsQuery);
    const userCardCount = (userCardResult[0] as any).total;
    console.log(`   Total: ${userCardCount} carta(s)`);

    // 4. Verificar DeckCards si existen mazos
    console.log('\n4️⃣ CARTAS EN MAZOS:');
    if (decks.length > 0) {
      const deckIds = decks.map((d: any) => `'${d.id}'`).join(',');
      const deckCardsQuery = `
        SELECT COUNT(*) as total
        FROM deck_cards 
        WHERE deck_id IN (${deckIds})
      `;
      const [deckCardsResult] = await sequelize.query(deckCardsQuery);
      const deckCardCount = (deckCardsResult[0] as any).total;
      console.log(`   Total: ${deckCardCount} carta(s) en mazos`);
    } else {
      console.log('   ⚠️  Sin mazos, no hay cartas en mazos');
    }

    // 5. Resumen final
    console.log('\n📊 RESUMEN:');
    const hasDecks = decks.length > 0;
    const hasActiveDecks = decks.some((d: any) => d.is_active);
    const hasCards = userCardCount > 0;

    console.log(`   Usuario existe: ✅`);
    console.log(`   Tiene mazos: ${hasDecks ? '✅' : '❌'}`);
    console.log(`   Mazo activo: ${hasActiveDecks ? '✅' : '❌'}`);
    console.log(`   Tiene cartas: ${hasCards ? '✅' : '❌'}`);

    if (!hasDecks || !hasCards || !hasActiveDecks) {
      console.log('\n⚠️  ACCIÓN NECESARIA: El usuario necesita el starter deck');
      console.log('   Ejecutar: npx ts-node src/scripts/assignStarterCards.ts ' + userId);
    } else {
      console.log('\n✅ El usuario está completamente configurado');
    }

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

investigateUser();
