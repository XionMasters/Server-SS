// scripts/addDeckBackColumn.ts
import sequelize from '../src/config/database';

async function run() {
  try {
    console.log('🔧 Conectando...');
    await sequelize.authenticate();
    console.log('✅ Conectado');

    const queryInterface = sequelize.getQueryInterface();
    const columns = await queryInterface.describeTable('decks');
    
    if (columns['current_deck_back_id']) {
      console.log('✅ Columna ya existe');
      process.exit(0);
    }

    console.log('🔧 Agregando columna...');
    const sql = `ALTER TABLE decks ADD COLUMN current_deck_back_id UUID REFERENCES deck_backs(id) ON DELETE SET NULL`;
    await sequelize.query(sql);
    
    console.log('✅ ¡Listo!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌', err.message);
    process.exit(1);
  }
}

run();
