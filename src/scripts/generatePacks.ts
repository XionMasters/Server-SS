// src/scripts/generatePacks.ts
import { sequelize } from '../config/database';
import Pack from '../models/Pack';

const generatePacks = async () => {
  try {
    console.log('🎁 Generando packs de cartas...');

    const packsData = [
      {
        name: 'Sobre de Bronce',
        description: 'Contiene 5 cartas con énfasis en cartas comunes y raras. Perfecto para comenzar tu colección.',
        price: 100,
        cards_per_pack: 5,
        guaranteed_rarity: 'rare',
        is_active: true,
        image_url: null
      },
      {
        name: 'Sobre de Plata',
        description: 'Contiene 7 cartas con mayor probabilidad de cartas épicas. ¡Una inversión inteligente!',
        price: 200,
        cards_per_pack: 7,
        guaranteed_rarity: 'epic',
        is_active: true,
        image_url: null
      },
      {
        name: 'Sobre de Oro',
        description: 'El sobre premium con 10 cartas y garantía de al menos 1 carta legendaria. ¡Para verdaderos coleccionistas!',
        price: 400,
        cards_per_pack: 10,
        guaranteed_rarity: 'legendary',
        is_active: true,
        image_url: null
      },
      {
        name: 'Sobre Básico',
        description: 'Un sobre económico con 3 cartas aleatorias. Ideal para probar suerte sin gastar mucho.',
        price: 50,
        cards_per_pack: 3,
        guaranteed_rarity: null,
        is_active: true,
        image_url: null
      },
      {
        name: 'Mega Pack',
        description: 'El pack definitivo con 15 cartas, garantizando al menos 1 legendaria y 2 épicas. ¡Solo para los más valientes!',
        price: 750,
        cards_per_pack: 15,
        guaranteed_rarity: 'legendary',
        is_active: true,
        image_url: null
      }
    ];

    let createdCount = 0;

    for (const packData of packsData) {
      try {
        // Verificar si el pack ya existe
        const existingPack = await Pack.findOne({
          where: { name: packData.name }
        });

        if (existingPack) {
          console.log(`⚠️  Pack ya existe: ${packData.name}`);
          continue;
        }

        // Crear pack
        await Pack.create(packData);
        createdCount++;
        console.log(`✅ Pack creado: ${packData.name} - ${packData.price} monedas`);

      } catch (error) {
        console.error(`❌ Error creando pack ${packData.name}:`, error);
      }
    }

    console.log(`🎉 ¡${createdCount} packs creados exitosamente!`);
    console.log('📊 Resumen de packs disponibles:');
    console.log('   🥉 Sobre Básico: 50 monedas (3 cartas)');
    console.log('   🥈 Sobre de Bronce: 100 monedas (5 cartas, 1 rara garantizada)');
    console.log('   🥇 Sobre de Plata: 200 monedas (7 cartas, 1 épica garantizada)');
    console.log('   💎 Sobre de Oro: 400 monedas (10 cartas, 1 legendaria garantizada)');
    console.log('   🌟 Mega Pack: 750 monedas (15 cartas, 1 legendaria garantizada)');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generando packs:', error);
    process.exit(1);
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  generatePacks();
}

export { generatePacks };