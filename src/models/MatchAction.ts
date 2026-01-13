// src/models/MatchAction.ts
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface MatchActionAttributes {
  id: string;
  match_id: string;
  player_id: string;
  turn_number: number;
  action_type: 'play_card' | 'attack' | 'defend' | 'change_mode' | 'activate_ability' | 'pass_turn' | 'surrender';
  action_data: string; // JSON con detalles de la acción
  created_at?: Date;
}

interface MatchActionCreationAttributes extends Optional<MatchActionAttributes, 'id' | 'created_at'> {}

class MatchAction extends Model<MatchActionAttributes, MatchActionCreationAttributes> implements MatchActionAttributes {
  public id!: string;
  public match_id!: string;
  public player_id!: string;
  public turn_number!: number;
  public action_type!: 'play_card' | 'attack' | 'defend' | 'change_mode' | 'activate_ability' | 'pass_turn' | 'surrender';
  public action_data!: string;
  public readonly created_at!: Date;
}

MatchAction.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    match_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'matches',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    player_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    turn_number: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    action_type: {
      type: DataTypes.ENUM('play_card', 'attack', 'defend', 'change_mode', 'activate_ability', 'pass_turn', 'surrender'),
      allowNull: false
    },
    action_data: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '{}'
    }
  },
  {
    sequelize,
    tableName: 'match_actions',
    timestamps: true,
    underscored: true,
    updatedAt: false // Solo created_at, no updated_at
  }
);

export default MatchAction;
