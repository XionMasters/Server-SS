// src/infrastructure/database/models/UserPackPity.ts
// Garantía de épica: sobres seguidos sin épica o superior, por jugador y sobre (migración 016).
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../../config/database';

class UserPackPity extends Model {
  public user_id!: string;
  public pack_id!: string;
  public packs_without_epic!: number;
  public updated_at!: Date;
}

UserPackPity.init(
  {
    user_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    pack_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: 'packs', key: 'id' },
      onDelete: 'CASCADE',
    },
    packs_without_epic: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0 },
    },
  },
  {
    sequelize,
    tableName: 'user_pack_pity',
    underscored: true,
    timestamps: true,
    createdAt: false,
    updatedAt: 'updated_at',
  }
);

export default UserPackPity;
