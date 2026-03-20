/**
 * addPendingSelectionColumn.ts
 *
 * Migración: agrega la columna `pending_selection` (JSONB) a la tabla `matches`.
 * Necesaria para el sistema de selección interactiva (revivir cartas, buscar en mazo, etc.)
 *
 * Uso:
 *   npx ts-node scripts/addPendingSelectionColumn.ts
 */

import { sequelize } from '../src/config/database';
import { QueryTypes } from 'sequelize';

async function addPendingSelectionColumn() {
  try {
    await sequelize.authenticate();
    console.log('Conexión a DB establecida.');

    // Verificar si la columna ya existe
    const [rows] = await sequelize.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'matches'
         AND column_name = 'pending_selection'`,
      { type: QueryTypes.SELECT }
    ) as any[];

    if (rows) {
      console.log('✅ La columna pending_selection ya existe. No se requieren cambios.');
      return;
    }

    await sequelize.query(`
      ALTER TABLE matches
      ADD COLUMN pending_selection JSONB DEFAULT NULL
    `);

    console.log('✅ Columna pending_selection agregada exitosamente a matches.');
  } catch (error) {
    console.error('❌ Error ejecutando migración:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

addPendingSelectionColumn();
