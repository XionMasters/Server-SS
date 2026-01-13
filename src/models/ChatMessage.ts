import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/database';

interface ChatMessageAttributes {
  id: string;
  user_id: string;
  username: string;
  message: string;
  message_type: 'global' | 'system' | 'whisper';
  target_user_id?: string | null;
  created_at?: Date;
  updated_at?: Date;
}

interface ChatMessageCreationAttributes extends Optional<ChatMessageAttributes, 'id' | 'target_user_id' | 'created_at' | 'updated_at'> {}

class ChatMessage extends Model<ChatMessageAttributes, ChatMessageCreationAttributes> implements ChatMessageAttributes {
  public id!: string;
  public user_id!: string;
  public username!: string;
  public message!: string;
  public message_type!: 'global' | 'system' | 'whisper';
  public target_user_id!: string | null;
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ChatMessage.init(
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
    username: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    message_type: {
      type: DataTypes.ENUM('global', 'system', 'whisper'),
      allowNull: false,
      defaultValue: 'global',
    },
    target_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
  },
  {
    sequelize,
    tableName: 'chat_messages',
    underscored: true,
    timestamps: true,
    indexes: [
      {
        fields: ['created_at']
      },
      {
        fields: ['user_id']
      }
    ]
  }
);

export default ChatMessage;
