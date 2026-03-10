// src/models/CardAbility.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CardAbility extends Model {
  public id!: string;
  public card_id!: string;
  public name!: string;
  /** Slug estable para comparación por código. Ej: 'justice_fist', 'match_1'. */
  public ability_key!: string | null;
  public type!: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
  public description!: string;
  public conditions!: object;
  public effects!: object;
}

CardAbility.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    ability_key: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: null,
      comment: 'Slug estable para matching por código. Ej: justice_fist, match_1',
    },
    type: {
      type: DataTypes.ENUM('activa', 'pasiva', 'equipamiento', 'campo'),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    conditions: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    effects: {
      type: DataTypes.JSONB,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'card_abilities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

export default CardAbility;