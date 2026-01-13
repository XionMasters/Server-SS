import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ProfileAvatarAttributes {
  id: string;
  name: string;
  image_url: string;
  unlock_type: 'default' | 'card_unlock' | 'achievement' | 'special';
  required_card_id?: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'divine';
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface ProfileAvatarCreationAttributes extends Optional<ProfileAvatarAttributes, 'id' | 'required_card_id' | 'created_at' | 'updated_at'> {}

class ProfileAvatar extends Model<ProfileAvatarAttributes, ProfileAvatarCreationAttributes> implements ProfileAvatarAttributes {
  public id!: string;
  public name!: string;
  public image_url!: string;
  public unlock_type!: 'default' | 'card_unlock' | 'achievement' | 'special';
  public required_card_id!: string | null;
  public rarity!: 'common' | 'rare' | 'epic' | 'legendary' | 'divine';
  public is_active!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ProfileAvatar.init(
  {
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
      }
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
  },
  {
    sequelize,
    tableName: 'profile_avatars',
    underscored: true,
    timestamps: true,
  }
);

// Asociaciones
// @ts-ignore
ProfileAvatar.associate = (models: any) => {
  ProfileAvatar.belongsTo(models.Card, {
    foreignKey: 'required_card_id',
    as: 'required_card'
  });
};

export default ProfileAvatar;
