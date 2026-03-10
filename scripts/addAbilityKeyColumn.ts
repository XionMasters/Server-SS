/**
 * addAbilityKeyColumn.ts
 *
 * Agrega la columna ability_key a la tabla card_abilities y la popula
 * automáticamente desde el campo name (lowercase + underscore, sin acentos).
 *
 * Uso: npx ts-node scripts/addAbilityKeyColumn.ts
 */
import * as dotenv from 'dotenv';
import pkg from 'pg';

const { Client } = pkg;

dotenv.config();

async function run() {
  const client = new Client({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '5432'),
    user:     process.env.DB_USER     || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME     || 'caballeros_cosmicos',
  });

  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL');

    // 1. Verificar si la columna ya existe
    const exists = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'card_abilities' AND column_name = 'ability_key'
    `);

    if (exists.rows.length > 0) {
      console.log('ℹ️  La columna ability_key ya existe');
    } else {
      console.log('🔧 Agregando columna ability_key...');
      await client.query(`
        ALTER TABLE card_abilities
        ADD COLUMN ability_key VARCHAR(100) DEFAULT NULL
      `);
      console.log('✅ Columna ability_key agregada');
    }

    // 2. Poblar los registros que aún no tienen ability_key
    //    Fórmula: lowercase → quitar acentos → reemplazar caracteres no alfanuméricos con _
    const updated = await client.query(`
      UPDATE card_abilities
      SET ability_key = regexp_replace(
        lower(translate(
          name,
          'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙãõÃÕ',
          'aeiouunAEIOUUNaeiouAEIOUaoAO'
        )),
        '[^a-z0-9]+', '_', 'g'
      )
      WHERE ability_key IS NULL
      RETURNING id, name, ability_key
    `);

    console.log(`✅ ${updated.rowCount} registros actualizados con ability_key`);
    if (updated.rows.length > 0) {
      console.table(updated.rows.map(r => ({ name: r.name, ability_key: r.ability_key })));
    }

    // 3. Agregar índice si no existe
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_card_abilities_key
      ON card_abilities (card_id, ability_key)
    `);
    console.log('✅ Índice idx_card_abilities_key listo');

  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
