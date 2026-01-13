// src/scripts/migrations/add-extended-card-fields.ts
import { sequelize } from '../../config/database';
import { QueryInterface, DataTypes } from 'sequelize';

async function addExtendedCardFields() {
  const queryInterface: QueryInterface = sequelize.getQueryInterface();

  try {
    console.log('🔄 Agregando nuevos campos a la tabla cards...');

    // Agregar campo 'generate' (cosmos que genera al jugarse)
    await queryInterface.addColumn('cards', 'generate', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    console.log('✅ Campo "generate" agregado');

    // Agregar campo 'max_copies' (cantidad máxima permitida en deck)
    await queryInterface.addColumn('cards', 'max_copies', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3
    });
    console.log('✅ Campo "max_copies" agregado');

    // Agregar campo 'unique' (si es carta única)
    await queryInterface.addColumn('cards', 'unique', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });
    console.log('✅ Campo "unique" agregado');

    // Agregar campo 'playable_zones' (zonas donde se puede jugar)
    await queryInterface.addColumn('cards', 'playable_zones', {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: ['battlefield']
    });
    console.log('✅ Campo "playable_zones" agregado');

    // Agregar campo 'collection_id' (ID de colección)
    await queryInterface.addColumn('cards', 'collection_id', {
      type: DataTypes.STRING(50),
      allowNull: true
    });
    console.log('✅ Campo "collection_id" agregado');

    // Agregar campo 'artist' (artista de la carta)
    await queryInterface.addColumn('cards', 'artist', {
      type: DataTypes.STRING(100),
      allowNull: true
    });
    console.log('✅ Campo "artist" agregado');

    // Agregar campo 'language' (idioma de la carta)
    await queryInterface.addColumn('cards', 'language', {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'es'
    });
    console.log('✅ Campo "language" agregado');

    // Agregar campo 'balance_notes' (notas de balance)
    await queryInterface.addColumn('cards', 'balance_notes', {
      type: DataTypes.TEXT,
      allowNull: true
    });
    console.log('✅ Campo "balance_notes" agregado');

    // Agregar campo 'power_level' (nivel de poder estimado)
    await queryInterface.addColumn('cards', 'power_level', {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    console.log('✅ Campo "power_level" agregado');

    // Agregar campo 'tags' (etiquetas de búsqueda)
    await queryInterface.addColumn('cards', 'tags', {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    });
    console.log('✅ Campo "tags" agregado');

    // Agregar campo 'card_set' (nombre del set/colección)
    await queryInterface.addColumn('cards', 'card_set', {
      type: DataTypes.STRING(100),
      allowNull: true
    });
    console.log('✅ Campo "card_set" agregado');

    // Agregar campo 'release_year' (año de lanzamiento)
    await queryInterface.addColumn('cards', 'release_year', {
      type: DataTypes.INTEGER,
      allowNull: true
    });
    console.log('✅ Campo "release_year" agregado');

    // Agregar campo 'notes' (notas adicionales)
    await queryInterface.addColumn('cards', 'notes', {
      type: DataTypes.TEXT,
      allowNull: true
    });
    console.log('✅ Campo "notes" agregado');

    console.log('✨ Todos los campos extendidos agregados exitosamente');
  } catch (error) {
    console.error('❌ Error agregando campos extendidos:', error);
    throw error;
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addExtendedCardFields()
    .then(() => {
      console.log('✅ Migración completada');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error en migración:', error);
      process.exit(1);
    });
}

export default addExtendedCardFields;
