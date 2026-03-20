import { sequelize } from '../src/config/database';

async function main() {
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ Extensión uuid-ossp habilitada');
  } catch (e: any) {
    console.error('❌', e.message);
  } finally {
    await sequelize.close();
  }
}

main();
