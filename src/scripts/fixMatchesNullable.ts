// Script para permitir NULL en player2_id y player2_deck_id
import sequelize from '../config/database';

async function fixMatchesTable() {
  try {
    console.log('🔧 Modificando tabla matches...');
    
    // Permitir NULL en player2_id
    await sequelize.query(`
      ALTER TABLE matches 
      ALTER COLUMN player2_id DROP NOT NULL;
    `);
    
    // Permitir NULL en player2_deck_id
    await sequelize.query(`
      ALTER TABLE matches 
      ALTER COLUMN player2_deck_id DROP NOT NULL;
    `);
    
    console.log('✅ Tabla matches modificada correctamente');
    console.log('   - player2_id ahora permite NULL');
    console.log('   - player2_deck_id ahora permite NULL');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error modificando tabla:', error);
    process.exit(1);
  }
}

fixMatchesTable();
