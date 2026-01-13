// src/models/UserPack.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class UserPack extends Model {
  public id!: string;
  public user_id!: string;
  public pack_id!: string;
  public quantity!: number;
  public acquired_at!: Date;
}

UserPack.init(
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
    pack_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'packs',
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
  },
  {
    sequelize,
    tableName: 'user_packs',
    underscored: true,
    timestamps: true,
    createdAt: 'acquired_at',
    updatedAt: false
  }
);

export default UserPack;