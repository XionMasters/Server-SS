/**
 * scripts/addTechniqueColumns.ts
 *
 * Migración: agrega las columnas ignore_ar y ta_effects a card_techniques.
 *
 * Uso:
 *   npx ts-node scripts/addTechniqueColumns.ts
 */

import { sequelize } from '../src/config/database';

async function run(): Promise<void> {
  try {
    console.log('🔧 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado');

    const qi = sequelize.getQueryInterface();
    const columns = await qi.describeTable('card_techniques');

    // ── ignore_ar ──────────────────────────────────────────────────────────
    if (columns['ignore_ar']) {
      console.log('⏭  ignore_ar ya existe, omitida');
    } else {
      await sequelize.query(
        `ALTER TABLE card_techniques ADD COLUMN ignore_ar BOOLEAN NOT NULL DEFAULT FALSE`,
      );
      console.log('✅ ignore_ar agregada');
    }

    // ── ta_effects ─────────────────────────────────────────────────────────
    if (columns['ta_effects']) {
      console.log('⏭  ta_effects ya existe, omitida');
    } else {
      await sequelize.query(
        `ALTER TABLE card_techniques ADD COLUMN ta_effects JSONB NOT NULL DEFAULT '[]'::jsonb`,
      );
      console.log('✅ ta_effects agregada');
    }

    console.log('\n🎉 Migración completada');
    process.exit(0);
  } catch (err) {
    console.error('❌', (err as Error).message);
    process.exit(1);
  }
}

run();
