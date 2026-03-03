/**
 * fix-defensive-mode-column.ts
 *
 * Migra la columna `is_defensive_mode` en `cards_in_play` de BOOLEAN a VARCHAR(20).
 *
 * Antes: BOOLEAN (false = normal, true = defense — no podía representar 'evasion')
 * Ahora: VARCHAR(20) con valores 'normal' | 'defense' | 'evasion'
 *
 * Conversión de datos existentes:
 *   false → 'normal'
 *   true  → 'defense'  (era el único modo activo guardable)
 *
 * Ejecutar: npx ts-node src/scripts/fix-defensive-mode-column.ts
 */
import { sequelize } from '../config/database';

async function fixDefensiveModeColumn() {
  try {
    console.log('🔄 Conectando a la base de datos...');
    await sequelize.authenticate();
    console.log('✅ Conectado');

    // 1️⃣ Agregar columna temporal VARCHAR
    console.log('🔄 Agregando columna temporal is_defensive_mode_new...');
    await sequelize.query(`
      ALTER TABLE cards_in_play
      ADD COLUMN IF NOT EXISTS is_defensive_mode_new VARCHAR(20) NOT NULL DEFAULT 'normal';
    `);

    // 2️⃣ Migrar datos: true → 'defense', false → 'normal'
    console.log('🔄 Migrando datos existentes...');
    await sequelize.query(`
      UPDATE cards_in_play
      SET is_defensive_mode_new = CASE
        WHEN is_defensive_mode = true  THEN 'defense'
        ELSE 'normal'
      END;
    `);

    // 3️⃣ Borrar columna vieja
    console.log('🔄 Eliminando columna BOOLEAN antigua...');
    await sequelize.query(`
      ALTER TABLE cards_in_play
      DROP COLUMN is_defensive_mode;
    `);

    // 4️⃣ Renombrar columna nueva
    console.log('🔄 Renombrando columna nueva...');
    await sequelize.query(`
      ALTER TABLE cards_in_play
      RENAME COLUMN is_defensive_mode_new TO is_defensive_mode;
    `);

    console.log('✅ Columna is_defensive_mode migrada:  BOOLEAN → VARCHAR(20)');
    console.log('✅ Valores: false→"normal", true→"defense"');

    // 5️⃣ También asegurarse de que can_attack_this_turn existe como BOOLEAN
    console.log('🔄 Verificando can_attack_this_turn...');
    await sequelize.query(`
      ALTER TABLE cards_in_play
      ALTER COLUMN can_attack_this_turn SET DEFAULT true;
    `);
    await sequelize.query(`
      ALTER TABLE cards_in_play
      ALTER COLUMN has_attacked_this_turn SET DEFAULT false;
    `);

    console.log('🎉 Migración completada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error en migración:', error);
    process.exit(1);
  }
}

fixDefensiveModeColumn();
