import { ChatMessage, ChatMessageRepository } from './chat-message.repository';

export class GetRecentMessagesUseCase {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  async execute(limit: number, hoursAgo: number): Promise<ChatMessage[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);

    return this.chatMessageRepository.findRecentGlobal(limit, cutoffDate);
  }
}
