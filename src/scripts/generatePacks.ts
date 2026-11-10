// src/scripts/generatePacks.ts
// Sincroniza los sobres de la BD con src/config/packs.config.ts (ver app/packs/packCatalog.service.ts).
//   npm run generate:packs        → aplica los cambios
//   npm run generate:packs:dry    → muestra qué haría, sin escribir nada
import { sequelize } from '../config/database';
import '../infrastructure/database/models/associations';
import { PACK_DEFINITIONS } from '../config/packs.config';
import { syncPackCatalog } from '../app/packs/packCatalog.service';

const generatePacks = async () => {
  const dryRun = process.argv.includes('--dry-run');
  try {
    await sequelize.authenticate();
    const packColumns = await sequelize.getQueryInterface().describeTable('packs');
    if (!packColumns['code']) {
      console.error('❌ Falta la migración 016 (src/migrations/sql/016_packs_v2_and_uncommon.sql).');
      console.error('   Arranca el servidor con NODE_ENV=development (la aplica sola) o ejecuta ese SQL a mano.');
      process.exit(1);
    }
    console.log(dryRun ? '🎁 Sobres (DRY-RUN: no se escribe nada)\n' : '🎁 Sincronizando sobres...\n');

    const report = await syncPackCatalog(PACK_DEFINITIONS, { dryRun });

    for (const removed of report.removed) console.log(`🗑️  Retirado: ${removed.name}${removed.code ? ` (${removed.code})` : ''}`);
    const refunded = report.refunds.reduce((sum, r) => sum + r.amount, 0);
    if (report.refunds.length > 0) {
      console.log(`💰 Devoluciones: ${report.refunds.length} (${refunded} monedas en total)`);
      for (const r of report.refunds) console.log(`     ${r.user_id}: ${r.quantity}x ${r.pack_name} → +${r.amount}`);
    }
    for (const code of report.created) console.log(`✅ Creado: ${code}`);
    for (const code of report.updated) console.log(`♻️  Actualizado: ${code}`);

    console.log('\n📊 Cartas por rareza en cada sobre:');
    for (const pool of report.pools) {
      const counts = Object.entries(pool.counts).map(([r, n]) => `${r} ${n}`).join(' · ');
      console.log(`   ${pool.code}: ${counts}`);
      if (pool.missing.length > 0) {
        console.log(`     ⚠️  Sin cartas de: ${pool.missing.join(', ')} (salen como la rareza más cercana por debajo)`);
      }
    }
    if (dryRun) console.log('\n(DRY-RUN: no se aplicó ningún cambio)');

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error sincronizando sobres:', error);
    process.exit(1);
  }
};

// Ejecutar si se llama directamente
if (require.main === module) {
  generatePacks();
}

export { generatePacks };
