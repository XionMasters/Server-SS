import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

interface UserDeckBackUnlockAttributes {
  id: string;
  user_id: string;
  deck_back_id: string;
  unlock_source: 'initial_setup' | 'card_unlock' | 'achievement' | 'purchase' | 'seasonal';
  unlocked_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

interface UserDeckBackUnlockCreationAttributes extends Omit<UserDeckBackUnlockAttributes, 'id' | 'unlocked_at' | 'created_at' | 'updated_at'> {
  id?: string;
  unlocked_at?: Date;
}

class UserDeckBackUnlock extends Model<UserDeckBackUnlockAttributes, UserDeckBackUnlockCreationAttributes> implements UserDeckBackUnlockAttributes {
  public id!: string;
  public user_id!: string;
  public deck_back_id!: string;
  public unlock_source!: 'initial_setup' | 'card_unlock' | 'achievement' | 'purchase' | 'seasonal';
  public unlocked_at?: Date;
  public created_at?: Date;
  public updated_at?: Date;
}

UserDeckBackUnlock.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    deck_back_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'deck_backs',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    unlock_source: {
      type: DataTypes.ENUM('initial_setup', 'card_unlock', 'achievement', 'purchase', 'seasonal'),
      defaultValue: 'initial_setup'
    },
    unlocked_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    tableName: 'user_deck_back_unlocks',
    timestamps: true,
    underscored: true
  }
);

export default UserDeckBackUnlock;
