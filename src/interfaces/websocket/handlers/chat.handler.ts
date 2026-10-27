import { WebSocket } from 'ws';
import { isChatMessageType } from '../../../app/chat/chat-message.repository';
import { ChatMessageError, SendChatMessageUseCase } from '../../../app/chat/send-chat-message.use-case';
import { SequelizeChatMessageRepository } from '../../../infrastructure/database/repositories/SequelizeChatMessageRepository';
import { WebSocketPresenceService } from '../../../infrastructure/websocket/presence.service';

interface ChatWebSocket extends WebSocket {
  userId?: string;
  username?: string;
}

export class WebSocketChatHandler {
  private readonly sendChatMessageUseCase = new SendChatMessageUseCase(
    new SequelizeChatMessageRepository()
  );

  constructor(private readonly presenceService: WebSocketPresenceService) {}

  async handleChatMessage(ws: ChatWebSocket, data: any): Promise<void> {
    try {
      const { message, message_type = 'global', target_user_id } = data as {
        message?: unknown;
        message_type?: unknown;
        target_user_id?: unknown;
      };

      if (typeof message !== 'string' || message.trim() === '') {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Mensaje vacío' });
        return;
      }

      if (!isChatMessageType(message_type)) {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Tipo de mensaje no válido' });
        return;
      }

      const targetUserId = typeof target_user_id === 'string' ? target_user_id : undefined;

      if (message_type === 'whisper' && !targetUserId) {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Destinatario no válido' });
        return;
      }

      const userId = ws.userId;
      const username = ws.username;

      if (!userId || !username) {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Usuario no autenticado' });
        return;
      }

      const chatMessage = await this.sendChatMessageUseCase.execute({
        userId,
        username,
        message: message.trim(),
        messageType: message_type,
        targetUserId,
      });

      const messageData = {
        id: chatMessage.id,
        user_id: chatMessage.userId,
        username: chatMessage.username,
        message: chatMessage.message,
        message_type: chatMessage.messageType,
        target_user_id: chatMessage.targetUserId,
        created_at: chatMessage.createdAt
      };

      if (message_type === 'whisper' && targetUserId) {
        this.presenceService.sendToUser(targetUserId, 'chat_message', messageData);
        this.presenceService.sendToSocket(ws, 'chat_message', messageData);
      } else {
        this.presenceService.broadcast('chat_message', messageData);
      }

      console.log(`💬 Chat [${message_type}] ${username}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    } catch (error) {
      if (error instanceof ChatMessageError) {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: error.message });
        return;
      }
      console.error('Error manejando mensaje de chat:', error);
      this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Error al enviar mensaje' });
    }
  }
}
