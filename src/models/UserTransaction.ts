// src/models/UserTransaction.ts
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export type TransactionType = 'EARN' | 'SPEND';
export type TransactionReason = 
  // Ganancias
  | 'REGISTRATION_BONUS'
  | 'DAILY_LOGIN'
  | 'MATCH_WIN'
  | 'MATCH_PARTICIPATION'
  | 'ACHIEVEMENT'
  | 'QUEST_REWARD'
  | 'ADMIN_GIFT'
  | 'EVENT_REWARD'
  // Gastos
  | 'PACK_PURCHASE'
  | 'CARD_PURCHASE'
  | 'UPGRADE_COST'
  | 'TOURNAMENT_FEE'
  | 'PREMIUM_FEATURE';

class UserTransaction extends Model {
  public id!: string;
  public user_id!: string;
  public amount!: number;
  public type!: TransactionType;
  public reason!: TransactionReason;
  public description!: string;
  public related_entity_type!: string | null; // 'pack', 'card', 'match', etc.
  public related_entity_id!: string | null;
  public balance_before!: number;
  public balance_after!: number;
  public metadata!: object | null; // JSON para datos adicionales
  public created_at!: Date;
}

UserTransaction.init(
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
    amount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1
      }
    },
    type: {
      type: DataTypes.ENUM('EARN', 'SPEND'),
      allowNull: false,
    },
    reason: {
      type: DataTypes.ENUM(
        'REGISTRATION_BONUS', 'DAILY_LOGIN', 'MATCH_WIN', 'MATCH_PARTICIPATION',
        'ACHIEVEMENT', 'QUEST_REWARD', 'ADMIN_GIFT', 'EVENT_REWARD',
        'PACK_PURCHASE', 'CARD_PURCHASE', 'UPGRADE_COST', 'TOURNAMENT_FEE', 'PREMIUM_FEATURE'
      ),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    related_entity_type: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    related_entity_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    balance_before: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    balance_after: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  },
  {
    sequelize,
    tableName: 'user_transactions',
    underscored: true,
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
  }
);

export default UserTransaction;