// src/scripts/addDeckBackColumn.ts
import * as dotenv from 'dotenv';
import pkg from 'pg';

const { Client } = pkg;

dotenv.config();

async function addColumn() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'caballeros_cosmicos',
  });

  try {
    await client.connect();
    console.log('✅ Conectado a PostgreSQL');

    // Check if column exists
    const result = await client.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name='decks' AND column_name='current_deck_back_id'
    `);

    if (result.rows.length > 0) {
      console.log('✅ La columna ya existe');
      await client.end();
      process.exit(0);
    }

    console.log('🔧 Agregando columna...');
    await client.query(`
      ALTER TABLE decks
      ADD COLUMN current_deck_back_id UUID REFERENCES deck_backs(id) ON DELETE SET NULL
    `);

    console.log('✅ Columna agregada exitosamente');
    await client.end();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

addColumn();
