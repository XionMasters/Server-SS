/**
 * models/ProcessedAction.ts
 * 
 * Modelo Sequelize para tabla processed_actions.
 * Usado por ProcessedActionsRegistry para idempotencia.
 */

import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class ProcessedAction extends Model {
  public id!: string;
  public action_id!: string;
  public match_id!: string;
  public player_number!: number;
  public action_type!: string;
  public cached_result?: any;
  public created_at?: Date;
  public updated_at?: Date;
}

ProcessedAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    action_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: 'UUID único de la acción (generado por cliente)',
    },
    match_id: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Referencia al match',
    },
    player_number: {
      type: DataTypes.SMALLINT,
      allowNull: false,
      validate: {
        min: 1,
        max: 2,
      },
      comment: 'Jugador que ejecutó la acción (1 o 2)',
    },
    action_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Tipo de acción: turn_end, card_play, attack, etc',
    },
    cached_result: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Resultado cacheado para reintentos',
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
    modelName: 'ProcessedAction',
    tableName: 'processed_actions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['action_id'],
        name: 'idx_processed_actions_action_id',
      },
      {
        fields: ['match_id'],
        name: 'idx_processed_actions_match_id',
      },
      {
        fields: ['created_at'],
        name: 'idx_processed_actions_created_at',
      },
      {
        fields: ['match_id', 'action_type'],
        name: 'idx_processed_actions_match_action',
      },
    ],
  }
);

// Relación con Match (si existe modelo Match)
try {
  const Match = require('./Match').default;
  ProcessedAction.belongsTo(Match, {
    foreignKey: 'match_id',
    as: 'match',
    onDelete: 'CASCADE',
  });
} catch (e) {
  // Match no cargado aún (orden de imports)
}

export default ProcessedAction;