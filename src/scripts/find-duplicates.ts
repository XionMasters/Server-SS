// Script para encontrar y eliminar cartas duplicadas
import { sequelize } from '../config/database';
import Card from '../infrastructure/database/models/Card';
import CardKnight from '../infrastructure/database/models/CardKnight';
import { QueryTypes } from 'sequelize';

async function findDuplicates() {
  try {
    await sequelize.authenticate();
    console.log('🔄 Buscando duplicados...\n');
    
    // Buscar duplicados por image_url (lo importante)
    const duplicatesByImage: any = await sequelize.query(`
      SELECT image_url, COUNT(*) as count, array_agg(id) as ids, array_agg(name) as names
      FROM cards
      WHERE image_url IS NOT NULL
      GROUP BY image_url
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `, { type: QueryTypes.SELECT });
    
    if (duplicatesByImage.length === 0) {
      console.log('✅ No se encontraron duplicados por imagen\n');
    } else {
      console.log(`⚠️  Se encontraron ${duplicatesByImage.length} imágenes duplicadas:\n`);
      for (const dup of duplicatesByImage) {
        console.log(`  ${dup.image_url} - ${dup.count} copias`);
        console.log(`    Nombres: ${dup.names.join(', ')}`);
        console.log(`    IDs: ${dup.ids.join(', ')}`);
      }
      console.log();
    }
    
    // Buscar cartas con nombres vacíos o sospechosos
    const emptyNames = await Card.findAll({
      where: sequelize.or(
        { name: '' },
        { name: null },
        sequelize.where(sequelize.fn('LENGTH', sequelize.col('name')), '<=', 3)
      )
    });
    
    if (emptyNames.length > 0) {
      console.log(`⚠️  Se encontraron ${emptyNames.length} cartas con nombres vacíos o muy cortos:\n`);
      for (const card of emptyNames) {
        console.log(`  ID: ${card.id} - Nombre: "${card.name}" - Imagen: ${card.image_url}`);
      }
      console.log();
    }
    
    console.log('='.repeat(60));
    console.log('Resumen:');
    console.log(`  Imágenes duplicadas: ${duplicatesByImage.length}`);
    console.log(`  Nombres vacíos/cortos: ${emptyNames.length}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

findDuplicates();
