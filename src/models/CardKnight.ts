// src/models/CardKnight.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CardKnight extends Model {
  public card_id!: string;
  public attack!: number;
  public defense!: number;
  public health!: number;
  public cosmos!: number;
  public can_defend!: boolean;
  public defense_reduction!: number;
}

CardKnight.init(
  {
    card_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    attack: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    defense: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    health: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    cosmos: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    can_defend: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    defense_reduction: {
      type: DataTypes.DECIMAL(3,2),
      defaultValue: 0.5
    }
  },
  {
    sequelize,
    tableName: 'card_knights',
    timestamps: false
  }
);

export default CardKnight;