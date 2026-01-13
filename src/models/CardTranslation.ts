// src/models/CardTranslation.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class CardTranslation extends Model {
  public id!: string;
  public card_id!: string;
  public language!: 'es' | 'en' | 'pt';
  public name!: string;
  public description!: string | null;
  public ability_translations!: object | null;
}

CardTranslation.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    language: {
      type: DataTypes.ENUM('es', 'en', 'pt'),
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ability_translations: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Traducciones de habilidades: {ability_id: {name: "...", description: "..."}}'
    }
  },
  {
    sequelize,
    tableName: 'card_translations',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ['card_id', 'language']
      }
    ]
  }
);

export default CardTranslation;
