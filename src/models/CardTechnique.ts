// src/models/CardTechnique.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * Parámetros de combate de una carta de tipo 'technique'.
 * Complementa al modelo Card cuando card.type === 'technique'.
 *
 * hit_count       → número de golpes consecutivos del TA
 * hit_ce          → CE por golpe
 * ta_cost         → CP que consume el caballero al usar el TA
 * compatible_tags → tags que debe tener el caballero para poder usar esta técnica
 */
class CardTechnique extends Model {
  public card_id!: string;
  public hit_count!: number;
  public hit_ce!: number;
  public ta_cost!: number;
  public compatible_tags!: string[];
  public ignore_ar!: boolean;
  public ta_effects!: Array<{ type: string; value?: number; turns?: number }>;
}

CardTechnique.init(
  {
    card_id: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: {
        model: 'cards',
        key: 'id',
      },
    },
    hit_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Número de golpes del TA',
    },
    hit_ce: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'CE por golpe',
    },
    ta_cost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'CP que consume el caballero al declarar este TA',
    },
    compatible_tags: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      allowNull: false,
      defaultValue: [],
      comment: 'Tags que debe tener el caballero para poder usar esta técnica',
    },
    ignore_ar: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Si true: el TA ignora la AR del defensor y la reducción de Modo Defensa',
    },
    ta_effects: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: 'Efectos inherentes aplicados al defensor cuando el TA conecta (burn, poison, etc.)',
    },
  },
  {
    sequelize,
    tableName: 'card_techniques',
    timestamps: false,
  },
);

export default CardTechnique;
