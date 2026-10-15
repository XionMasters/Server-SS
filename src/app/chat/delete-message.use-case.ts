import { ChatMessageRepository } from './chat-message.repository';

export type DeleteChatMessageResult = 'deleted' | 'not-found' | 'forbidden';

export class DeleteMessageUseCase {
  constructor(private readonly chatMessageRepository: ChatMessageRepository) {}

  async execute(userId: string, messageId: string): Promise<DeleteChatMessageResult> {
    const message = await this.chatMessageRepository.findById(messageId);

    if (!message) {
      return 'not-found';
    }

    if (message.userId !== userId) {
      return 'forbidden';
    }

    await this.chatMessageRepository.deleteById(messageId);
    return 'deleted';
  }
}
