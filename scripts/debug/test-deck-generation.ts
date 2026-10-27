// Test script to verify deck generation with quantities
import fetch from 'node-fetch';

const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';
const token = 'PASTE_TOKEN_HERE'; // Will need to be set manually or retrieved
const baseUrl = 'http://localhost:3000/api';

async function testDeckGeneration() {
  try {
    console.log('🚀 Iniciando test de generación de mazos...\n');

    // Get user info
    console.log('1️⃣ Obteniendo información del usuario...');
    const userRes = await fetch(`${baseUrl}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) {
      console.error('❌ Error getting user info');
      return;
    }
    const user = await userRes.json();
    console.log(`✅ Usuario: ${user.username}, Oro: ${user.currency}\n`);

    // Get user decks
    console.log('2️⃣ Obteniendo mazos del usuario...');
    const decksRes = await fetch(`${baseUrl}/decks`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!decksRes.ok) {
      console.error('❌ Error getting decks');
      return;
    }
    const decks = await decksRes.json();
    console.log(`✅ Total de mazos: ${decks.length}`);

    if (decks.length === 0) {
      console.log('❌ Usuario no tiene mazos');
      return;
    }

    const deckId = decks[0].id;
    console.log(`   Usando mazo ID: ${deckId}\n`);

    // Test auto-generate
    console.log('3️⃣ Generando mazo automáticamente (estrategia: balanced)...');
    const genRes = await fetch(`${baseUrl}/decks/${deckId}/auto-generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        strategy: 'balanced',
        targetCards: 45
      })
    });

    if (!genRes.ok) {
      const error = await genRes.json();
      console.error('❌ Error generando mazo:', error.error);
      return;
    }

    const generatedDeck = await genRes.json();
    console.log(`✅ Mazo generado exitosamente`);
    console.log(`   - Cartas únicas: ${generatedDeck.deck_cards.length}`);
    console.log(`   - Cartas totales: ${generatedDeck.deck_cards.reduce((sum: number, c: any) => sum + c.quantity, 0)}`);
    
    // Show card breakdown
    const byType: { [key: string]: number } = {};
    const byRarity: { [key: string]: number } = {};
    
    for (const card of generatedDeck.deck_cards.slice(0, 5)) {
      console.log(`     • ${card.card.name}: ${card.quantity}x (${card.card.type}, ${card.card.rarity})`);
    }
    if (generatedDeck.deck_cards.length > 5) {
      console.log(`     ... y ${generatedDeck.deck_cards.length - 5} más`);
    }

    console.log('\n✅ Test completado exitosamente!');

  } catch (error) {
    console.error('Error:', error);
  }
}

testDeckGeneration();
