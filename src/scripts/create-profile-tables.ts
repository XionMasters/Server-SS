import dotenv from 'dotenv';
import sequelize from '../config/database';
import { QueryInterface, DataTypes } from 'sequelize';

dotenv.config();

async function createProfileTables() {
  await sequelize.authenticate();
  console.log('🔌 Conectado a la base de datos\n');
  
  const queryInterface: QueryInterface = sequelize.getQueryInterface();
  
  try {
    // 1. Crear tabla profile_avatars
    console.log('📦 Creando tabla profile_avatars...');
    
    const avatarsTableExists = await queryInterface.showAllTables()
      .then(tables => tables.includes('profile_avatars'));
    
    if (!avatarsTableExists) {
      await queryInterface.createTable('profile_avatars', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        image_url: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        unlock_type: {
          type: DataTypes.ENUM('default', 'card_unlock', 'achievement', 'special'),
          allowNull: false,
          defaultValue: 'default',
        },
        required_card_id: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: 'cards',
            key: 'id'
          },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE'
        },
        rarity: {
          type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary', 'divine'),
          allowNull: false,
          defaultValue: 'common',
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      });
      console.log('✅ Tabla profile_avatars creada');
    } else {
      console.log('⏭️  Tabla profile_avatars ya existe');
    }
    
    // 2. Crear tabla user_avatar_unlocks
    console.log('\n📦 Creando tabla user_avatar_unlocks...');
    
    const unlocksTableExists = await queryInterface.showAllTables()
      .then(tables => tables.includes('user_avatar_unlocks'));
    
    if (!unlocksTableExists) {
      await queryInterface.createTable('user_avatar_unlocks', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        avatar_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'profile_avatars',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        unlocked_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        unlock_source: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      });
      
      // Agregar índice único
      await queryInterface.addIndex('user_avatar_unlocks', ['user_id', 'avatar_id'], {
        unique: true,
        name: 'user_avatar_unlocks_user_id_avatar_id'
      });
      
      console.log('✅ Tabla user_avatar_unlocks creada');
    } else {
      console.log('⏭️  Tabla user_avatar_unlocks ya existe');
    }
    
    // 3. Crear tabla user_profiles
    console.log('\n📦 Creando tabla user_profiles...');
    
    const profilesTableExists = await queryInterface.showAllTables()
      .then(tables => tables.includes('user_profiles'));
    
    if (!profilesTableExists) {
      await queryInterface.createTable('user_profiles', {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        user_id: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onDelete: 'CASCADE',
          onUpdate: 'CASCADE'
        },
        avatar_image_id: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: 'profile_avatars',
            key: 'id'
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE'
        },
        created_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updated_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      });
      console.log('✅ Tabla user_profiles creada');
    } else {
      console.log('⏭️  Tabla user_profiles ya existe');
    }
    
    console.log('\n✅ Migración de tablas de perfil completada');
    console.log('\n💡 Ejecuta el seed: ts-node src/scripts/seed-profile-avatars.ts');
    
  } catch (error: any) {
    console.error('❌ Error en migración:', error.message);
    throw error;
  } finally {
    await sequelize.close();
  }
}

createProfileTables().catch((error) => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
