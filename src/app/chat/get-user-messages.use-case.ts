import { ChatMessage, ChatMessageRepository } from './chat-message.repository';

export class GetUserMessagesUseCase {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  execute(userId: string, limit: number): Promise<ChatMessage[]> {
    return this.chatMessageRepository.findForUser(userId, limit);
  }
}
