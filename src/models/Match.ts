// src/models/Match.ts
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface MatchAttributes {
  id: string;
  player1_id: string;
  player2_id: string | null;
  player1_deck_id: string;
  player2_deck_id: string | null;
  current_turn: number;
  current_player: number; // 1 o 2
  phase: 'waiting' | 'starting' | 'player1_turn' | 'player2_turn' | 'finished';
  winner_id?: string;
  player1_life: number;
  player2_life: number;
  player1_cosmos: number;
  player2_cosmos: number;
  player1_deck_order?: string; // JSON array of card IDs
  player2_deck_order?: string; // JSON array of card IDs
  player1_deck_index?: number; // Current position in deck
  player2_deck_index?: number; // Current position in deck
  started_at?: Date;
  finished_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

interface MatchCreationAttributes extends Optional<MatchAttributes, 'id' | 'player2_id' | 'player2_deck_id' | 'current_turn' | 'current_player' | 'phase' | 'winner_id' | 'player1_life' | 'player2_life' | 'player1_cosmos' | 'player2_cosmos' | 'started_at' | 'finished_at' | 'created_at' | 'updated_at'> {}

class Match extends Model<MatchAttributes, MatchCreationAttributes> implements MatchAttributes {
  public id!: string;
  public player1_id!: string;
  public player2_id!: string | null;
  public player1_deck_id!: string;
  public player2_deck_id!: string | null;
  public current_turn!: number;
  public current_player!: number;
  public phase!: 'waiting' | 'starting' | 'player1_turn' | 'player2_turn' | 'finished';
  public winner_id?: string;
  public player1_life!: number;
  public player2_life!: number;
  public player1_cosmos!: number;
  public player2_cosmos!: number;
  public player1_deck_order?: string;
  public player2_deck_order?: string;
  public player1_deck_index?: number;
  public player2_deck_index?: number;
  public started_at?: Date;
  public finished_at?: Date;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

Match.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    player1_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    player2_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    player1_deck_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'decks',
        key: 'id'
      }
    },
    player2_deck_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'decks',
        key: 'id'
      }
    },
    current_turn: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false
    },
    current_player: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      validate: {
        isIn: [[1, 2]]
      }
    },
    phase: {
      type: DataTypes.ENUM('waiting', 'starting', 'player1_turn', 'player2_turn', 'finished'),
      defaultValue: 'waiting',
      allowNull: false
    },
    winner_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    player1_life: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      allowNull: false
    },
    player2_life: {
      type: DataTypes.INTEGER,
      defaultValue: 12,
      allowNull: false
    },
    player1_cosmos: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    player2_cosmos: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
    player1_deck_order: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    player2_deck_order: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    player1_deck_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    player2_deck_index: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    started_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    finished_at: {
      type: DataTypes.DATE,
      allowNull: true
    }
  },
  {
    sequelize,
    tableName: 'matches',
    timestamps: true,
    underscored: true
  }
);

export default Match;
