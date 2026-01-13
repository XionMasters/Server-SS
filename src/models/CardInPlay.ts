// src/models/CardInPlay.ts
import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface CardInPlayAttributes {
  id: string;
  match_id: string;
  card_id: string;
  player_number: number; // 1 o 2
  zone: 'hand' | 'field_knight' | 'field_support' | 'field_helper' | 'yomotsu' | 'cositos' | 'deck';
  position: number; // Posición en la zona (0-4 para caballeros)
  is_defensive_mode: 'normal' | 'defense' | 'evasion';
  current_attack: number;
  current_defense: number;
  current_health: number;
  current_cosmos: number;
  attached_cards: string; // JSON array de IDs de cartas equipadas
  status_effects: string; // JSON array de efectos activos
  can_attack_this_turn: boolean;
  has_attacked_this_turn: boolean;
  created_at?: Date;
  updated_at?: Date;
}

interface CardInPlayCreationAttributes extends Optional<CardInPlayAttributes, 'id' | 'is_defensive_mode' | 'can_attack_this_turn' | 'has_attacked_this_turn' | 'attached_cards' | 'status_effects' | 'created_at' | 'updated_at'> {}

class CardInPlay extends Model<CardInPlayAttributes, CardInPlayCreationAttributes> implements CardInPlayAttributes {
  public id!: string;
  public match_id!: string;
  public card_id!: string;
  public player_number!: number;
  public zone!: 'hand' | 'field_knight' | 'field_support' | 'field_helper' | 'yomotsu' | 'cositos' | 'deck';
  public position!: number;
  public is_defensive_mode!: 'normal' | 'defense' | 'evasion';
  public current_attack!: number;
  public current_defense!: number;
  public current_health!: number;
  public current_cosmos!: number;
  public attached_cards!: string;
  public status_effects!: string;
  public can_attack_this_turn!: boolean;
  public has_attacked_this_turn!: boolean;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

CardInPlay.init(
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
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    player_number: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        isIn: [[1, 2]]
      }
    },
    zone: {
      type: DataTypes.ENUM('hand', 'field_knight', 'field_support', 'field_helper', 'yomotsu', 'cositos', 'deck'),
      allowNull: false
    },
    position: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    is_defensive_mode: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    current_attack: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    current_defense: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    current_health: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    current_cosmos: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    attached_cards: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    },
    status_effects: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: '[]'
    },
    can_attack_this_turn: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false
    },
    has_attacked_this_turn: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    }
  },
  {
    sequelize,
    tableName: 'cards_in_play',
    timestamps: true,
    underscored: true
  }
);

export default CardInPlay;
