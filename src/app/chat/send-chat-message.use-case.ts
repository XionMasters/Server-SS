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

export const MAX_CHAT_MESSAGE_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_MESSAGES = 5;

export class ChatMessageError extends Error {}

export class SendChatMessageUseCase {
  // userId -> timestamps de mensajes recientes
  private readonly recentMessages = new Map<string, number[]>();

  constructor(
    private readonly chatMessageRepository: ChatMessageRepository,
    private readonly now: () => number = Date.now
  ) {}

  async execute(input: SendChatMessageInput): Promise<ChatMessage> {
    const message = input.message.trim();

    if (!message) {
      throw new ChatMessageError('Mensaje vacío');
    }

    if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
      throw new ChatMessageError(`El mensaje no puede superar ${MAX_CHAT_MESSAGE_LENGTH} caracteres`);
    }

    this.enforceRateLimit(input.userId);

    return this.chatMessageRepository.create({
      userId: input.userId,
      username: input.username,
      message,
      messageType: input.messageType,
      targetUserId: input.messageType === 'whisper' ? input.targetUserId ?? null : null,
    });
  }

  private enforceRateLimit(userId: string): void {
    const now = this.now();
    const recent = (this.recentMessages.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (recent.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.recentMessages.set(userId, recent);
      throw new ChatMessageError('Estás enviando mensajes demasiado rápido');
    }

    recent.push(now);
    this.recentMessages.set(userId, recent);
  }
}
