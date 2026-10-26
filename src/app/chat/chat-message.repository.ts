export type ChatMessageType = 'global' | 'system' | 'whisper';

export const isChatMessageType = (value: unknown): value is ChatMessageType =>
  value === 'global' || value === 'system' || value === 'whisper';

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  message: string;
  messageType: ChatMessageType;
  targetUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChatMessageInput {
  userId: string;
  username: string;
  message: string;
  messageType: ChatMessageType;
  targetUserId: string | null;
}

export interface ChatMessageRepository {
  findRecentGlobal(limit: number, since: Date): Promise<ChatMessage[]>;
  findForUser(userId: string, limit: number): Promise<ChatMessage[]>;
  findById(messageId: string): Promise<ChatMessage | null>;
  create(input: CreateChatMessageInput): Promise<ChatMessage>;
  deleteById(messageId: string): Promise<void>;
}
