// src/models/UserCardTransaction.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type CardTransactionType = 'ACQUIRE' | 'LOSE';
export type CardTransactionReason = 
  // Adquirir cartas
  | 'PACK_OPENING'
  | 'DIRECT_PURCHASE'
  | 'TRADE_RECEIVED'
  | 'QUEST_REWARD'
  | 'EVENT_REWARD'
  | 'ADMIN_GIFT'
  | 'STARTER_PACK'
  | 'STARTER_DECK'
  | 'ACHIEVEMENT_REWARD'
  // Perder cartas
  | 'TRADE_SENT'
  | 'CARD_SALE'
  | 'UPGRADE_MATERIAL'
  | 'ADMIN_REMOVAL'
  | 'TOURNAMENT_ANTE';

class UserCardTransaction extends Model {
  public id!: string;
  public user_id!: string;
  public card_id!: string;
  public quantity!: number;
  public type!: CardTransactionType;
  public reason!: CardTransactionReason;
  public description!: string;
  public is_foil!: boolean;
  public related_entity_type!: string | null; // 'pack', 'trade', 'match', etc.
  public related_entity_id!: string | null;
  public metadata!: object | null; // JSON para datos adicionales
  public created_at!: Date;
}

UserCardTransaction.init(
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
        key: 'id'
      }
    },
    card_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'cards',
        key: 'id'
      }
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    type: {
      type: DataTypes.ENUM('ACQUIRE', 'LOSE'),
      allowNull: false,
    },
    reason: {
      type: DataTypes.ENUM(
        'PACK_OPENING', 'DIRECT_PURCHASE', 'TRADE_RECEIVED', 'QUEST_REWARD',
        'EVENT_REWARD', 'ADMIN_GIFT', 'STARTER_PACK', 'STARTER_DECK', 'ACHIEVEMENT_REWARD',
        'TRADE_SENT', 'CARD_SALE', 'UPGRADE_MATERIAL', 'ADMIN_REMOVAL', 'TOURNAMENT_ANTE'
      ),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    is_foil: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    related_entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    related_entity_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  },
  {
    sequelize,
    tableName: 'user_card_transactions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

export default UserCardTransaction;