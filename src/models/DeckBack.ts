import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface DeckBackAttributes {
  id: string;
  name: string;
  image_url: string;
  unlock_type: 'default' | 'achievement' | 'purchase' | 'seasonal';
  required_card_id?: string | null;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface DeckBackCreationAttributes extends Omit<DeckBackAttributes, 'id' | 'created_at' | 'updated_at'> {
  id?: string;
}

class DeckBack extends Model<DeckBackAttributes, DeckBackCreationAttributes> implements DeckBackAttributes {
  public id!: string;
  public name!: string;
  public image_url!: string;
  public unlock_type!: 'default' | 'achievement' | 'purchase' | 'seasonal';
  public required_card_id?: string | null;
  public rarity!: 'common' | 'rare' | 'epic' | 'legendary';
  public is_active!: boolean;
  public created_at?: Date;
  public updated_at?: Date;
}

DeckBack.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    image_url: {
      type: DataTypes.STRING,
      allowNull: false
    },
    unlock_type: {
      type: DataTypes.ENUM('default', 'achievement', 'purchase', 'seasonal'),
      defaultValue: 'default'
    },
    required_card_id: {
      type: DataTypes.UUID,
      allowNull: true
    },
    rarity: {
      type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary'),
      defaultValue: 'common'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'deck_backs',
    timestamps: true,
    underscored: true
  }
);

export default DeckBack;
