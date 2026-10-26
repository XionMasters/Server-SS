import { Op } from 'sequelize';
import {
  ChatMessage,
  ChatMessageRepository,
  CreateChatMessageInput,
} from '../../../app/chat/chat-message.repository';
import ChatMessageModel from '../models/ChatMessage';

const toChatMessage = (message: ChatMessageModel): ChatMessage => ({
  id: message.id,
  userId: message.user_id,
  username: message.username,
  message: message.message,
  messageType: message.message_type,
  targetUserId: message.target_user_id,
  createdAt: message.created_at,
  updatedAt: message.updated_at,
});

export class SequelizeChatMessageRepository implements ChatMessageRepository {
  async findRecentGlobal(limit: number, since: Date): Promise<ChatMessage[]> {
    const messages = await ChatMessageModel.findAll({
      where: {
        message_type: 'global',
        created_at: {
          [Op.gte]: since,
        },
      },
      order: [['created_at', 'DESC']],
      limit,
    });

    return messages.reverse().map(toChatMessage);
  }

  async findForUser(userId: string, limit: number): Promise<ChatMessage[]> {
    const messages = await ChatMessageModel.findAll({
      where: {
        [Op.or]: [
          { user_id: userId },
          { target_user_id: userId },
        ],
      },
      order: [['created_at', 'DESC']],
      limit,
    });

    return messages.reverse().map(toChatMessage);
  }

  async findById(messageId: string): Promise<ChatMessage | null> {
    const message = await ChatMessageModel.findByPk(messageId);
    return message ? toChatMessage(message) : null;
  }

  async create(input: CreateChatMessageInput): Promise<ChatMessage> {
    const message = await ChatMessageModel.create({
      user_id: input.userId,
      username: input.username,
      message: input.message,
      message_type: input.messageType,
      target_user_id: input.targetUserId,
    });

    return toChatMessage(message);
  }

  async deleteById(messageId: string): Promise<void> {
    await ChatMessageModel.destroy({ where: { id: messageId } });
  }
}
