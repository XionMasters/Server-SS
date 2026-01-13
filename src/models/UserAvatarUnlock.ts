import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface UserAvatarUnlockAttributes {
  id: string;
  user_id: string;
  avatar_id: string;
  unlocked_at?: Date;
  unlock_source?: string;
  created_at?: Date;
  updated_at?: Date;
}

interface UserAvatarUnlockCreationAttributes extends Optional<UserAvatarUnlockAttributes, 'id' | 'unlocked_at' | 'unlock_source' | 'created_at' | 'updated_at'> {}

class UserAvatarUnlock extends Model<UserAvatarUnlockAttributes, UserAvatarUnlockCreationAttributes> implements UserAvatarUnlockAttributes {
  public id!: string;
  public user_id!: string;
  public avatar_id!: string;
  public unlocked_at!: Date;
  public unlock_source!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

UserAvatarUnlock.init(
  {
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
      }
    },
    avatar_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'profile_avatars',
        key: 'id'
      }
    },
    unlocked_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    unlock_source: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'pack_opening, achievement, etc.'
    },
  },
  {
    sequelize,
    tableName: 'user_avatar_unlocks',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'avatar_id']
      }
    ]
  }
);

// Asociaciones
// @ts-ignore
UserAvatarUnlock.associate = (models: any) => {
  UserAvatarUnlock.belongsTo(models.ProfileAvatar, {
    foreignKey: 'avatar_id',
    as: 'avatar'
  });
  UserAvatarUnlock.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
};

export default UserAvatarUnlock;
