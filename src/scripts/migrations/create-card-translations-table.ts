// src/scripts/migrations/create-card-translations-table.ts
import { sequelize } from '../../config/database';
import { QueryInterface, DataTypes } from 'sequelize';

async function createCardTranslationsTable() {
  const queryInterface: QueryInterface = sequelize.getQueryInterface();

  try {
    console.log('🔄 Creando tabla de traducciones de cartas...');

    // Crear ENUM de idiomas
    await queryInterface.sequelize.query(`
      DO $$ BEGIN
        CREATE TYPE enum_card_translations_language AS ENUM ('es', 'en', 'pt');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ ENUM de idiomas creado');

    // Crear tabla card_translations
    await queryInterface.createTable('card_translations', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      card_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'cards',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      language: {
        type: DataTypes.ENUM('es', 'en', 'pt'),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      ability_translations: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      }
    });
    console.log('✅ Tabla card_translations creada');

    // Crear índice único para card_id + language
    await queryInterface.addIndex('card_translations', ['card_id', 'language'], {
      unique: true,
      name: 'card_translations_card_id_language_unique'
    });
    console.log('✅ Índice único creado');

    console.log('✨ Tabla de traducciones creada exitosamente');
  } catch (error) {
    console.error('❌ Error creando tabla de traducciones:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  createCardTranslationsTable()
    .then(() => {
      console.log('✅ Migración completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en migración:', error);
      process.exit(1);
    });
}

export default createCardTranslationsTable;
