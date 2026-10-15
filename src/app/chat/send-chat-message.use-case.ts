import {
  ChatMessage,
  ChatMessageRepository,
  ChatMessageType,
} from './chat-message.repository';

export interface SendChatMessageInput {
  userId: string;
  username: string;
  message: string;
  messageType: ChatMessageType;
  targetUserId?: string;
}

export class SendChatMessageUseCase {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  async execute(input: SendChatMessageInput): Promise<ChatMessage> {
    const message = input.message.trim();

    if (!message) {
      throw new Error('Mensaje vacío');
    }

    return this.chatMessageRepository.create({
      userId: input.userId,
      username: input.username,
      message,
      messageType: input.messageType,
      targetUserId: input.messageType === 'whisper' ? input.targetUserId ?? null : null,
    });
  }
}
