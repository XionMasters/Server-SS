import { Request, Response } from 'express';
import { DeleteMessageUseCase } from '../../../app/chat/delete-message.use-case';
import { ChatMessage } from '../../../app/chat/chat-message.repository';
import { GetRecentMessagesUseCase } from '../../../app/chat/get-recent-messages.use-case';
import { GetUserMessagesUseCase } from '../../../app/chat/get-user-messages.use-case';
import { SequelizeChatMessageRepository } from '../../../infrastructure/database/repositories/SequelizeChatMessageRepository';

const chatMessageRepository = new SequelizeChatMessageRepository();
const getRecentMessagesUseCase = new GetRecentMessagesUseCase(chatMessageRepository);
const getUserMessagesUseCase = new GetUserMessagesUseCase(chatMessageRepository);
const deleteMessageUseCase = new DeleteMessageUseCase(chatMessageRepository);

const toHttpResponse = (message: ChatMessage) => ({
  id: message.id,
  user_id: message.userId,
  username: message.username,
  message: message.message,
  message_type: message.messageType,
  target_user_id: message.targetUserId,
  created_at: message.createdAt,
  updated_at: message.updatedAt,
});

export const getRecentMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const hoursAgo = parseInt(req.query.hours as string) || 2;
    const messages = await getRecentMessagesUseCase.execute(limit, hoursAgo);

    res.json({
      messages: messages.map(toHttpResponse),
      total: messages.length
    });
  } catch (error) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes del chat' });
  }
};

export const getUserMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const limit = parseInt(req.query.limit as string) || 50;
    const messages = await getUserMessagesUseCase.execute(user.id, limit);

    res.json({
      messages: messages.map(toHttpResponse),
      total: messages.length
    });
  } catch (error) {
    console.error('Error obteniendo mensajes privados:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes privados' });
  }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { message_id } = req.params;

    const result = await deleteMessageUseCase.execute(user.id, message_id);

    if (result === 'not-found') {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }

    if (result === 'forbidden') {
      res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
      return;
    }

    res.json({ message: 'Mensaje eliminado correctamente' });
  } catch (error) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({ error: 'Error eliminando mensaje' });
  }
};
