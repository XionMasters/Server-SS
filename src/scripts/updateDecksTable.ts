import sequelize from '../config/database';

/**
 * Agregar columnas faltantes a tabla decks
 */

async function updateDecksTable() {
  try {
    console.log('🔄 Actualizando tabla decks...');

    // Agregar columnas si no existen (usar SQL directo para mayor control)
    await sequelize.query(`
      DO $$
      BEGIN
        -- Agregar description si no existe
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'decks' AND column_name = 'description'
        ) THEN
          ALTER TABLE decks ADD COLUMN description TEXT;
          RAISE NOTICE 'Columna description agregada';
        ELSE
          RAISE NOTICE 'Columna description ya existe';
        END IF;

        -- Agregar is_active si no existe
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'decks' AND column_name = 'is_active'
        ) THEN
          ALTER TABLE decks ADD COLUMN is_active BOOLEAN DEFAULT false;
          RAISE NOTICE 'Columna is_active agregada';
        ELSE
          RAISE NOTICE 'Columna is_active ya existe';
        END IF;
      END
      $$;
    `);

    console.log('✅ Tabla decks actualizada correctamente');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

updateDecksTable();
