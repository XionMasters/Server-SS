// src/infrastructure/database/models/Pack.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../config/database';

class Pack extends Model {
  public id!: string;
  public name!: string;
  public description!: string;
  public price!: number;
  public cards_per_pack!: number;
  public guaranteed_rarity!: string | null;
  public is_active!: boolean;
  public image_url!: string | null;
  /** Sobres v2 (migración 016) */
  public code!: string | null;
  public collections!: string[];
  public coming_soon!: boolean;
  public pity_threshold!: number;
  public sort_order!: number;
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
      type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary'),
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
    code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
    },
    // cards.collection_id cuyas cartas pueden salir en el sobre
    collections: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
    },
    coming_soon: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    pity_threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10,
      validate: { min: 1 },
    },
    sort_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
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