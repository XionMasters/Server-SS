// src/models/Pack.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class Pack extends Model {
  public id!: string;
  public name!: string;
  public description!: string;
  public price!: number;
  public cards_per_pack!: number;
  public guaranteed_rarity!: string | null;
  public is_active!: boolean;
  public image_url!: string | null;
  public created_at!: Date;
  public updated_at!: Date;
}

Pack.init(
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
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    price: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    cards_per_pack: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
      validate: {
        min: 1,
        max: 15
      }
    },
    guaranteed_rarity: {
      type: DataTypes.ENUM('comun', 'rara', 'epica', 'legendaria'),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    image_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'packs',
    underscored: true,
    timestamps: true,
  }
);

export default Pack;