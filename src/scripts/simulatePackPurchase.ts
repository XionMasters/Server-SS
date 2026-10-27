import sequelize from '../config/database';
import User from '../infrastructure/database/models/User';
import Pack from '../infrastructure/database/models/Pack';
import UserPack from '../infrastructure/database/models/UserPack';
import Card from '../infrastructure/database/models/Card';
import UserCard from '../infrastructure/database/models/UserCard';
import UserTransaction from '../infrastructure/database/models/UserTransaction';
import UserCardTransaction from '../infrastructure/database/models/UserCardTransaction';
import transactionService from '../infrastructure/database/services/transaction.service';
import '../infrastructure/database/models/associations';

/**
 * Simulación completa de compra y apertura de sobres
 */

async function simulatePurchaseAndOpening() {
  const transaction = await sequelize.transaction();

  try {
    console.log('🎮 SIMULACIÓN DE COMPRA Y APERTURA DE SOBRES\n');

    // 1. Crear usuario de prueba
    console.log('1️⃣ Creando usuario de prueba...');
    const user = await User.create({
      username: 'PackTester',
      email: 'packtester@example.com',
      password_hash: 'hashed',
      currency: 2000
    }, { transaction });
    console.log(`   ✅ Usuario: ${user.username}`);
    console.log(`   💰 Monedas iniciales: ${user.currency}\n`);

    // 2. Obtener pack de Oro
    const goldPack = await Pack.findOne({
      where: { name: 'Sobre de Oro' }
    });

    if (!goldPack) {
      throw new Error('Pack de Oro no encontrado');
    }

    console.log('2️⃣ Comprando pack...');
    console.log(`   📦 Pack: ${goldPack.name}`);
    console.log(`   💵 Precio: ${goldPack.price} monedas`);
    console.log(`   🎴 Cartas por pack: ${goldPack.cards_per_pack}`);
    console.log(`   ⭐ Garantía: ${goldPack.guaranteed_rarity}\n`);

    // 3. Simular compra
    const totalCost = goldPack.price;
    const balanceBefore = user.currency;
    user.currency -= totalCost;
    await user.save({ transaction });

    // Registrar transacción de monedas
    await UserTransaction.create({
      user_id: user.id,
      amount: totalCost,
      type: 'SPEND',
      reason: 'PACK_PURCHASE',
      description: `Compra de 1x ${goldPack.name}`,
      balance_before: balanceBefore,
      balance_after: user.currency,
      related_entity_type: 'pack',
      related_entity_id: goldPack.id,
      metadata: { pack_name: goldPack.name, quantity: 1 }
    }, { transaction });

    console.log('3️⃣ Compra registrada:');
    console.log(`   💰 Monedas gastadas: ${totalCost}`);
    console.log(`   💰 Monedas restantes: ${user.currency}`);
    console.log(`   ✅ Transacción de monedas guardada\n`);

    // Agregar pack al inventario
    await UserPack.create({
      user_id: user.id,
      pack_id: goldPack.id,
      quantity: 1
    }, { transaction });

    // 4. Simular apertura
    console.log('4️⃣ Abriendo pack...\n');

    const generatedCards = [];
    const RARITY_WEIGHTS = {
      'comun': 60,
      'rara': 25,
      'epica': 12,
      'legendaria': 3
    };

    for (let i = 0; i < goldPack.cards_per_pack; i++) {
      let targetRarity = undefined;

      // Última carta debe ser legendaria (garantía)
      if (i === goldPack.cards_per_pack - 1 && goldPack.guaranteed_rarity) {
        targetRarity = goldPack.guaranteed_rarity;
      } else {
        // Generar rareza aleatoria
        const random = Math.random() * 100;
        let cumulative = 0;
        for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
          cumulative += weight;
          if (random <= cumulative) {
            targetRarity = rarity;
            break;
          }
        }
      }

      // Obtener carta aleatoria de esa rareza
      const cards = await Card.findAll({
        where: { rarity: targetRarity },
        transaction
      });

      if (cards.length === 0) continue;

      const card = cards[Math.floor(Math.random() * cards.length)];
      const isfoil = Math.random() < 0.05;

      generatedCards.push({ ...card.toJSON(), is_foil: isfoil });

      // Agregar a colección del usuario
      const existingUserCard = await UserCard.findOne({
        where: { user_id: user.id, card_id: card.id },
        transaction
      });

      if (existingUserCard) {
        existingUserCard.quantity += 1;
        await existingUserCard.save({ transaction });
      } else {
        await UserCard.create({
          user_id: user.id,
          card_id: card.id,
          quantity: 1,
          is_foil: isfoil
        }, { transaction });
      }

      // Registrar transacción de carta
      await UserCardTransaction.create({
        user_id: user.id,
        card_id: card.id,
        quantity: 1,
        type: 'ACQUIRE',
        reason: 'PACK_OPENING',
        description: `Carta obtenida al abrir ${goldPack.name}`,
        is_foil: isfoil,
        related_entity_type: 'pack',
        related_entity_id: goldPack.id,
        metadata: {
          pack_name: goldPack.name,
          card_name: card.name,
          card_rarity: card.rarity
        }
      }, { transaction });

      const foilIcon = isfoil ? '✨' : '';
      const rarityIcons: Record<string, string> = {
        'comun': '⚪',
        'rara': '🔵',
        'epica': '🟣',
        'legendaria': '🟡',
        'divina': '💎'
      };
      console.log(`   ${rarityIcons[card.rarity] || '❓'} ${card.name} (${card.rarity.toUpperCase()}) ${foilIcon}`);
    }

    console.log('\n5️⃣ Resumen de apertura:');
    const summary = generatedCards.reduce((acc, card) => {
      acc[card.rarity] = (acc[card.rarity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`   Total de cartas: ${generatedCards.length}`);
    console.log(`   Por rareza:`);
    if (summary.comun) console.log(`     - Común: ${summary.comun}`);
    if (summary.rara) console.log(`     - Rara: ${summary.rara}`);
    if (summary.epica) console.log(`     - Épica: ${summary.epica}`);
    if (summary.legendaria) console.log(`     - Legendaria: ${summary.legendaria}`);

    const foilCount = generatedCards.filter(c => c.is_foil).length;
    if (foilCount > 0) {
      console.log(`   ✨ Cartas foil: ${foilCount}`);
    }

    // 6. Verificar logs
    console.log('\n6️⃣ Verificando logs en base de datos...');

    const currencyLogs = await UserTransaction.findAll({
      where: { user_id: user.id },
      transaction
    });

    const cardLogs = await UserCardTransaction.findAll({
      where: { user_id: user.id },
      transaction
    });

    console.log(`   ✅ Transacciones de monedas: ${currencyLogs.length}`);
    console.log(`   ✅ Transacciones de cartas: ${cardLogs.length}`);

    // Mostrar ejemplo de log
    if (currencyLogs.length > 0) {
      const log = currencyLogs[0].toJSON();
      console.log('\n   📄 Ejemplo de log de monedas:');
      console.log(`      Tipo: ${log.type} | Razón: ${log.reason}`);
      console.log(`      Cantidad: ${log.amount}`);
      console.log(`      Balance: ${log.balance_before} → ${log.balance_after}`);
      console.log(`      Metadata:`, log.metadata);
    }

    if (cardLogs.length > 0) {
      const log = cardLogs[0].toJSON();
      console.log('\n   🃏 Ejemplo de log de carta:');
      console.log(`      Tipo: ${log.type} | Razón: ${log.reason}`);
      console.log(`      Carta ID: ${log.card_id}`);
      console.log(`      Foil: ${log.is_foil}`);
      console.log(`      Metadata:`, log.metadata);
    }

    await transaction.commit();

    // Limpiar
    console.log('\n7️⃣ Limpiando datos de prueba...');
    await user.destroy();
    console.log('   ✅ Usuario de prueba eliminado\n');

    console.log('🎉 SIMULACIÓN COMPLETADA EXITOSAMENTE!\n');

    process.exit(0);
  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error en simulación:', error);
    process.exit(1);
  }
}

simulatePurchaseAndOpening();
