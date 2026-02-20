import { sequelize } from './src/config/database';

async function addGoldToUser() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos\n');

    const userId = '9788e4d5-5d8a-4dad-b914-af0ce8b44c10';
    const goldToAdd = 2000;
    
    const result = await sequelize.query(
      `UPDATE users SET currency = currency + :gold WHERE id = :userId RETURNING id, username, currency`,
      {
        replacements: { userId, gold: goldToAdd },
        type: 'UPDATE',
      }
    );

    console.log(`✅ Se agregaron ${goldToAdd} de oro al usuario.`);
    console.log(`💰 Saldo total después: 100 + ${goldToAdd} = ${100 + goldToAdd} de oro`);

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

addGoldToUser();
