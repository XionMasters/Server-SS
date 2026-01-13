import dotenv from 'dotenv';
import { DataTypes } from 'sequelize';
import sequelize from '../config/database';

dotenv.config();

async function main() {
  await sequelize.authenticate();
  console.log('🔌 Conectado a la base de datos para migración');

  const queryInterface = sequelize.getQueryInterface();
  const tableInfo = await queryInterface.describeTable('matches');

  const columns = [
    {
      name: 'player1_deck_order',
      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      }
    },
    {
      name: 'player2_deck_order',
      definition: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: []
      }
    },
    {
      name: 'player1_deck_index',
      definition: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    },
    {
      name: 'player2_deck_index',
      definition: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      }
    }
  ];

  for (const column of columns) {
    if (!Reflect.has(tableInfo, column.name)) {
      console.log(`➕ Creando columna ${column.name}`);
      await queryInterface.addColumn('matches', column.name, column.definition);
    } else {
      console.log(`✅ Columna ${column.name} ya existe, omitiendo`);
    }
  }

  const finalInfo = await queryInterface.describeTable('matches');
  console.table(finalInfo);

  await sequelize.close();
  console.log('🎉 Migración completada');
}

main().catch((error) => {
  console.error('❌ Error al ejecutar la migración:', error);
  process.exit(1);
});