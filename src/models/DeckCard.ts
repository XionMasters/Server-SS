// src/models/DeckCard.ts
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface DeckCardAttributes {
  deck_id: string;
  card_id: string;
  quantity: number;
}

interface DeckCardCreationAttributes extends Optional<DeckCardAttributes, never> {}

class DeckCard extends Model<DeckCardAttributes, DeckCardCreationAttributes> implements DeckCardAttributes {
  public deck_id!: string;
  public card_id!: string;
  public quantity!: number;
}

DeckCard.init(
  {
    deck_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'decks',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'cards',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: 1,
        max: 3, // Máximo 3 copias de una carta
      },
    },
  },
  {
    sequelize,
    tableName: 'deck_cards',
    timestamps: false,
    underscored: true,
  }
);

export default DeckCard;
