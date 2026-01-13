import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface UserProfileAttributes {
  id: string;
  user_id: string;
  avatar_image_id: string;
  created_at?: Date;
  updated_at?: Date;
}

interface UserProfileCreationAttributes extends Optional<UserProfileAttributes, 'id' | 'created_at' | 'updated_at'> {}

class UserProfile extends Model<UserProfileAttributes, UserProfileCreationAttributes> implements UserProfileAttributes {
  public id!: string;
  public user_id!: string;
  public avatar_image_id!: string;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

UserProfile.init(
  {
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
      }
    },
    avatar_image_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'profile_avatars',
        key: 'id'
      }
    },
  },
  {
    sequelize,
    tableName: 'user_profiles',
    underscored: true,
    timestamps: true,
  }
);

// Asociaciones (se cargan después en index.ts)
// @ts-ignore
UserProfile.associate = (models: any) => {
  UserProfile.belongsTo(models.ProfileAvatar, {
    foreignKey: 'avatar_image_id',
    as: 'avatar'
  });
  UserProfile.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
};

export default UserProfile;
