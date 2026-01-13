// src/models/UserCard.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class UserCard extends Model {
  public user_id!: string;
  public card_id!: string;
  public quantity!: number;
  public is_foil!: boolean;
  public acquired_at!: Date;
}

UserCard.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    card_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1
      }
    },
    is_foil: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  },
  {
    sequelize,
    tableName: 'user_cards',
    underscored: true,
    timestamps: true,
    createdAt: 'acquired_at',
    updatedAt: false
  }
);

export default UserCard;