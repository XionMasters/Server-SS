// Test script para probar el sistema de logging de transacciones
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

let authToken = '';
let userId = '';

async function testTransactionLogging() {
  try {
    console.log('🧪 Iniciando pruebas del sistema de logging de transacciones...\n');

    // 1. Registrar un nuevo usuario
    console.log('1. Registrando nuevo usuario...');
    const registerResponse = await axios.post(`${BASE_URL}/auth/register`, {
      username: 'testuser_transactions',
      email: 'test.transactions@example.com',
      password: 'password123'
    });
    
    console.log('✅ Usuario registrado exitosamente');
    console.log(`   - User ID: ${registerResponse.data.user.id}`);
    console.log(`   - Currency inicial: ${registerResponse.data.user.currency}\n`);

    authToken = registerResponse.data.token;
    userId = registerResponse.data.user.id;

    // 2. Verificar packs disponibles
    console.log('2. Obteniendo packs disponibles...');
    const packsResponse = await axios.get(`${BASE_URL}/packs`);
    console.log(`✅ ${packsResponse.data.length} packs disponibles`);
    
    const basicPack = packsResponse.data.find(pack => pack.name === 'Sobre Básico');
    if (!basicPack) {
      throw new Error('Pack básico no encontrado');
    }
    console.log(`   - Sobre Básico: ${basicPack.price} monedas\n`);

    // 3. Comprar un pack
    console.log('3. Comprando pack básico...');
    const buyResponse = await axios.post(`${BASE_URL}/packs/${basicPack.id}/buy`, {}, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log('✅ Pack comprado exitosamente');
    console.log(`   - Nuevo balance: ${buyResponse.data.user.currency} monedas`);
    console.log(`   - Packs en inventario: ${buyResponse.data.user.packs.length}\n`);

    // 4. Abrir el pack
    console.log('4. Abriendo pack...');
    const userPackId = buyResponse.data.user.packs[0].id;
    const openResponse = await axios.post(`${BASE_URL}/packs/${userPackId}/open`, {}, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log('✅ Pack abierto exitosamente');
    console.log(`   - Cartas obtenidas: ${openResponse.data.cards.length}`);
    openResponse.data.cards.forEach((card, index) => {
      console.log(`     ${index + 1}. ${card.name} (${card.rarity})`);
    });
    console.log();

    // 5. Verificar historial de transacciones de monedas
    console.log('5. Verificando historial de transacciones de monedas...');
    const currencyHistoryResponse = await axios.get(`${BASE_URL}/transactions/currency-history`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log(`✅ ${currencyHistoryResponse.data.length} transacciones de monedas encontradas:`);
    currencyHistoryResponse.data.forEach((transaction, index) => {
      console.log(`   ${index + 1}. ${transaction.type} ${transaction.amount} - ${transaction.reason}`);
      console.log(`      Balance: ${transaction.balance_before} → ${transaction.balance_after}`);
      console.log(`      Fecha: ${new Date(transaction.created_at).toLocaleString()}`);
    });
    console.log();

    // 6. Verificar historial de transacciones de cartas
    console.log('6. Verificando historial de transacciones de cartas...');
    const cardHistoryResponse = await axios.get(`${BASE_URL}/transactions/card-history`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log(`✅ ${cardHistoryResponse.data.length} transacciones de cartas encontradas:`);
    cardHistoryResponse.data.forEach((transaction, index) => {
      console.log(`   ${index + 1}. ${transaction.type} ${transaction.quantity}x carta - ${transaction.reason}`);
      console.log(`      Descripción: ${transaction.description}`);
      console.log(`      Fecha: ${new Date(transaction.created_at).toLocaleString()}`);
    });
    console.log();

    // 7. Verificar estadísticas de transacciones
    console.log('7. Verificando estadísticas de transacciones...');
    const statsResponse = await axios.get(`${BASE_URL}/transactions/stats`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    console.log('✅ Estadísticas de transacciones:');
    console.log(`   - Total ganado: ${statsResponse.data.totalEarned} monedas`);
    console.log(`   - Total gastado: ${statsResponse.data.totalSpent} monedas`);
    console.log(`   - Balance actual: ${statsResponse.data.currentBalance} monedas`);
    console.log(`   - Cartas adquiridas: ${statsResponse.data.totalCardsAcquired}`);
    console.log(`   - Cartas perdidas: ${statsResponse.data.totalCardsLost}`);
    console.log();

    console.log('🎉 ¡Todas las pruebas del sistema de logging de transacciones completadas exitosamente!');

  } catch (error) {
    console.error('❌ Error en las pruebas:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Ejecutar las pruebas
testTransactionLogging();