import {
  ChatMessageError,
  MAX_CHAT_MESSAGE_LENGTH,
  SendChatMessageUseCase,
} from '../../src/app/chat/send-chat-message.use-case';

describe('SendChatMessageUseCase', () => {
  const repository = {
    create: jest.fn(async (input: any) => ({ id: 'msg', createdAt: new Date(), ...input })),
  } as any;

  beforeEach(() => jest.clearAllMocks());

  const send = (useCase: SendChatMessageUseCase, message = 'hola', userId = 'user-1') =>
    useCase.execute({ userId, username: 'Seiya', message, messageType: 'global' });

  test('rejects messages over the maximum length', async () => {
    const useCase = new SendChatMessageUseCase(repository);

    await expect(send(useCase, 'x'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1))).rejects.toBeInstanceOf(ChatMessageError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  test('rate limits a user that sends too many messages in the window', async () => {
    let now = 1_000_000;
    const useCase = new SendChatMessageUseCase(repository, () => now);

    for (let i = 0; i < 5; i++) await send(useCase);
    await expect(send(useCase)).rejects.toThrow('demasiado rápido');

    // Otro usuario no se ve afectado
    await expect(send(useCase, 'hola', 'user-2')).resolves.toBeDefined();

    // Pasada la ventana vuelve a poder enviar
    now += 10_001;
    await expect(send(useCase)).resolves.toBeDefined();
  });
});
