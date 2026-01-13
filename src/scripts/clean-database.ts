// Script para limpiar cartas duplicadas y con problemas
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import { QueryTypes } from 'sequelize';

async function cleanDatabase() {
  try {
    await sequelize.authenticate();
    console.log('🔄 Limpiando base de datos...\n');
    
    let deletedCount = 0;
    
    // 1. Eliminar duplicados por imagen (mantener el más antiguo)
    console.log('1️⃣  Eliminando duplicados por imagen...');
    const duplicatesByImage: any = await sequelize.query(`
      SELECT image_url, array_agg(id ORDER BY created_at ASC) as ids
      FROM cards
      WHERE image_url IS NOT NULL
      GROUP BY image_url
      HAVING COUNT(*) > 1
    `, { type: QueryTypes.SELECT });
    
    for (const dup of duplicatesByImage) {
      // Mantener el primero (más antiguo), eliminar los demás
      const idsToDelete = dup.ids.slice(1);
      
      for (const id of idsToDelete) {
        // Primero eliminar de card_knights si existe
        await CardKnight.destroy({ where: { card_id: id } });
        // Luego eliminar la carta
        await Card.destroy({ where: { id } });
        console.log(`  ❌ Eliminado duplicado de imagen: ${dup.image_url} (ID: ${id})`);
        deletedCount++;
      }
    }
    
    // 2. Eliminar cartas con nombre vacío o muy corto
    console.log('\n2️⃣  Eliminando cartas con nombres vacíos o muy cortos...');
    const emptyNames = await Card.findAll({
      where: sequelize.or(
        { name: '' },
        { name: null },
        sequelize.where(sequelize.fn('LENGTH', sequelize.col('name')), '<=', 2)
      )
    });
    
    for (const card of emptyNames) {
      // Eliminar de card_knights si existe
      await CardKnight.destroy({ where: { card_id: card.id } });
      // Eliminar la carta
      await Card.destroy({ where: { id: card.id } });
      console.log(`  ❌ Eliminada carta sin nombre válido (ID: ${card.id}, imagen: ${card.image_url})`);
      deletedCount++;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`🎉 Limpieza completada`);
    console.log(`❌ Cartas eliminadas: ${deletedCount}`);
    
    // Mostrar estadísticas finales
    const totalCards = await Card.count();
    console.log(`✅ Cartas restantes: ${totalCards}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanDatabase();
