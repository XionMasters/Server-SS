import { WebSocket } from 'ws';
import ChatMessage from '../../models/ChatMessage';
import { WebSocketPresenceService } from './websocket-presence.service';

interface ChatWebSocket extends WebSocket {
  userId?: string;
  username?: string;
}

export class WebSocketChatService {
  constructor(private readonly presenceService: WebSocketPresenceService) {}

  async handleChatMessage(ws: ChatWebSocket, data: any): Promise<void> {
    try {
      const { message, message_type = 'global', target_user_id } = data;

      if (!message || message.trim() === '') {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Mensaje vacío' });
        return;
      }

      const userId = ws.userId;
      const username = ws.username;

      if (!userId || !username) {
        this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Usuario no autenticado' });
        return;
      }

      const chatMessage = await ChatMessage.create({
        user_id: userId,
        username,
        message: message.trim(),
        message_type,
        target_user_id: message_type === 'whisper' ? target_user_id : null
      });

      const messageData = {
        id: chatMessage.id,
        user_id: userId,
        username,
        message: chatMessage.message,
        message_type: chatMessage.message_type,
        target_user_id: chatMessage.target_user_id,
        created_at: chatMessage.created_at
      };

      if (message_type === 'whisper' && target_user_id) {
        this.presenceService.sendToUser(target_user_id, 'chat_message', messageData);
        this.presenceService.sendToSocket(ws, 'chat_message', messageData);
      } else {
        this.presenceService.broadcast('chat_message', messageData);
      }

      console.log(`💬 Chat [${message_type}] ${username}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    } catch (error) {
      console.error('Error manejando mensaje de chat:', error);
      this.presenceService.sendToSocket(ws, 'chat_error', { error: 'Error al enviar mensaje' });
    }
  }
}