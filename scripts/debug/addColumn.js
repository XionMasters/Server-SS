// addColumn.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function addColumn() {
  try {
    const client = await pool.connect();
    console.log('✅ Conectado a PostgreSQL');

    // Check if column exists
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='decks' AND column_name='current_deck_back_id'
    `);

    if (result.rows.length > 0) {
      console.log('✅ La columna ya existe');
      client.release();
      pool.end();
      process.exit(0);
    }

    console.log('🔧 Agregando columna...');
    await client.query(`
      ALTER TABLE decks
      ADD COLUMN current_deck_back_id UUID REFERENCES deck_backs(id) ON DELETE SET NULL
    `);

    console.log('✅ Columna agregada exitosamente');
    client.release();
    pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    pool.end();
    process.exit(1);
  }
}

addColumn();
