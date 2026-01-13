import sequelize from '../config/database';
import User from '../models/User';
import Pack from '../models/Pack';
import Card from '../models/Card';
import '../models/associations';

/**
 * Script de prueba del sistema de compra y apertura de sobres
 */

async function testPackSystem() {
  try {
    console.log('🧪 INICIANDO PRUEBA DEL SISTEMA DE SOBRES\n');

    // 1. Crear usuario de prueba
    console.log('1️⃣ Creando usuario de prueba...');
    const testUser = await User.create({
      username: 'TestPlayer',
      email: 'test@example.com',
      password_hash: 'hashed_password',
      currency: 5000 // Darle 5000 monedas
    });
    console.log(`   ✅ Usuario creado: ${testUser.username} con ${testUser.currency} monedas\n`);

    // 2. Verificar packs disponibles
    console.log('2️⃣ Verificando packs disponibles...');
    const packs = await Pack.findAll({ where: { is_active: true } });
    console.log(`   ✅ Packs disponibles: ${packs.length}`);
    packs.forEach(pack => {
      console.log(`      - ${pack.name}: ${pack.price} monedas (${pack.cards_per_pack} cartas, garantía: ${pack.guaranteed_rarity || 'ninguna'})`);
    });
    console.log('');

    // 3. Verificar cartas disponibles por rareza
    console.log('3️⃣ Verificando cartas disponibles...');
    const rarities = ['comun', 'rara', 'epica', 'legendaria'];
    const cardCounts: Record<string, number> = {};
    
    for (const rarity of rarities) {
      const count = await Card.count({ where: { rarity } });
      cardCounts[rarity] = count;
      console.log(`   ${rarity.toUpperCase()}: ${count} cartas`);
    }
    console.log('');

    // 4. Mostrar probabilidades
    console.log('4️⃣ PROBABILIDADES DE RAREZA:');
    console.log('   Común:      60% (60 de cada 100 cartas)');
    console.log('   Rara:       25% (25 de cada 100 cartas)');
    console.log('   Épica:      12% (12 de cada 100 cartas)');
    console.log('   Legendaria:  3% (3 de cada 100 cartas)');
    console.log('');

    // 5. Información sobre logging
    console.log('5️⃣ SISTEMA DE LOGGING DE TRANSACCIONES:');
    console.log('   ✅ Gastos de monedas: UserTransaction');
    console.log('      - Registra: cantidad, tipo (SPEND/EARN), razón (PACK_PURCHASE)');
    console.log('      - Incluye: balance antes/después, metadata del pack');
    console.log('');
    console.log('   ✅ Cartas obtenidas: UserCardTransaction');
    console.log('      - Registra: carta, cantidad, tipo (ACQUIRE/LOSE)');
    console.log('      - Incluye: rareza, si es foil, pack de origen');
    console.log('      - 5% probabilidad de carta foil (brillante)');
    console.log('');

    // 6. Endpoints disponibles
    console.log('6️⃣ ENDPOINTS PARA VER HISTORIAL:');
    console.log('   GET /api/transactions/currency');
    console.log('   GET /api/transactions/cards');
    console.log('   GET /api/transactions/stats');
    console.log('   GET /api/transactions/recent');
    console.log('');

    // 7. Ejemplo de flujo completo
    console.log('7️⃣ FLUJO DE COMPRA Y APERTURA:');
    console.log('   1. Usuario compra pack → POST /api/packs/buy');
    console.log('      - Se descuentan monedas');
    console.log('      - Se registra en UserTransaction (SPEND, PACK_PURCHASE)');
    console.log('      - Se agrega pack al inventario (UserPack)');
    console.log('');
    console.log('   2. Usuario abre pack → POST /api/packs/open');
    console.log('      - Se generan N cartas según probabilidades');
    console.log('      - Se garantiza rareza mínima si aplica');
    console.log('      - Se agregan a colección (UserCard)');
    console.log('      - Se registra cada carta en UserCardTransaction (ACQUIRE, PACK_OPENING)');
    console.log('');

    // 8. Garantías por pack
    console.log('8️⃣ GARANTÍAS POR TIPO DE PACK:');
    const basicPack = packs.find(p => p.name.includes('Básico'));
    const bronzePack = packs.find(p => p.name.includes('Bronce'));
    const silverPack = packs.find(p => p.name.includes('Plata'));
    const goldPack = packs.find(p => p.name.includes('Oro'));
    const megaPack = packs.find(p => p.name.includes('Mega'));

    if (basicPack) console.log(`   ${basicPack.name}: SIN garantía (pura suerte)`);
    if (bronzePack) console.log(`   ${bronzePack.name}: 1 carta RARA garantizada`);
    if (silverPack) console.log(`   ${silverPack.name}: 1 carta ÉPICA garantizada`);
    if (goldPack) console.log(`   ${goldPack.name}: 1 carta LEGENDARIA garantizada`);
    if (megaPack) console.log(`   ${megaPack.name}: 1 carta LEGENDARIA garantizada`);
    console.log('');

    // Limpiar usuario de prueba
    await testUser.destroy();
    console.log('✅ Prueba completada. Usuario de prueba eliminado.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error en prueba:', error);
    process.exit(1);
  }
}

testPackSystem();
