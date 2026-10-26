/**
 * scripts/addCardTechniquesTable.ts
 *
 * Crea la tabla card_techniques en la BD.
 * Seguro de ejecutar múltiples veces (IF NOT EXISTS + IF NOT EXISTS en columnas).
 *
 * Uso:
 *   npx ts-node scripts/addCardTechniquesTable.ts
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';

async function run() {
  console.log('Creando tabla card_techniques...');

  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS card_techniques (
      card_id     UUID PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      hit_count   INTEGER NOT NULL DEFAULT 1,
      hit_ce      INTEGER NOT NULL DEFAULT 0,
      ta_cost     INTEGER NOT NULL DEFAULT 0,
      compatible_tags TEXT[] NOT NULL DEFAULT '{}'
    );`,
    { type: QueryTypes.RAW },
  );

  console.log('✔ Tabla card_techniques lista.');
  await sequelize.close();
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
