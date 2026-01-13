// src/models/Deck.ts
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface DeckAttributes {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface DeckCreationAttributes extends Optional<DeckAttributes, 'id' | 'description' | 'is_active' | 'created_at' | 'updated_at'> {}

class Deck extends Model<DeckAttributes, DeckCreationAttributes> implements DeckAttributes {
  public id!: string;
  public user_id!: string;
  public name!: string;
  public description?: string;
  public is_active!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Deck.init(
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
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'decks',
    timestamps: true,
    underscored: true,
  }
);

export default Deck;
