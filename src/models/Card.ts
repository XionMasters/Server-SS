// src/models/Card.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class Card extends Model {
  public id!: string;
  public name!: string;
  public type!: 'knight' | 'technique' | 'item' | 'stage' | 'helper' | 'event';
  public rarity!: 'common' | 'rare' | 'epic' | 'legendary' | 'divine';
  public cost!: number;
  public generate!: number;
  public description!: string | null;
  public image_url!: string | null;
  public faction!: string | null;
  public element!: 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null;
  public max_copies!: number;
  public unique!: boolean;
  public playable_zones!: string[] | null;
  public collection_id!: string | null;
  public artist!: string | null;
  public language!: string | null;
  public balance_notes!: string | null;
  public power_level!: number | null;
  public tags!: string[] | null;
  public card_set!: string | null;
  public release_year!: number | null;
  public notes!: string | null;
}

Card.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('knight', 'technique', 'item', 'stage', 'helper', 'event'),
      allowNull: false,
    },
    rarity: {
      type: DataTypes.ENUM('common', 'rare', 'epic', 'legendary', 'divine'),
      allowNull: false,
    },
    cost: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    generate: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    image_url: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    faction: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    element: {
      type: DataTypes.ENUM('steel', 'fire', 'water', 'earth', 'wind', 'light', 'dark'),
      allowNull: true,
    },
    max_copies: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 3,
    },
    unique: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    playable_zones: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: ['battlefield'],
    },
    collection_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    artist: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    language: {
      type: DataTypes.STRING(10),
      allowNull: true,
      defaultValue: 'es',
    },
    balance_notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    power_level: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: [],
    },
    card_set: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    release_year: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: 'cards',
    underscored: true,
    timestamps: true,
  }
);

export default Card;