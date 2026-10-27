import { WebSocket } from 'ws';
import { WebSocketPresenceService } from '../../../infrastructure/websocket/presence.service';

const DEFAULT_AVATAR = '/assets/avatars/avatar_1.png';

export function createPresenceHandlers(presenceService: WebSocketPresenceService) {
  const serializeUsers = () =>
    presenceService.getOnlineUsers().map(u => ({
      user_id: u.userId,
      username: u.username,
      avatar_url: u.avatarUrl || DEFAULT_AVATAR,
      status: u.status,
      connected_at: u.connectedAt.toISOString()
    }));

  const broadcastOnlineUsers = () => {
    const users = serializeUsers();
    presenceService.broadcast('online_users', { users });
    console.log(`📡 Broadcast: ${users.length} usuarios en línea`);
  };

  const sendOnlineUsersList = (ws: WebSocket) => {
    presenceService.sendToSocket(ws, 'online_users', { users: serializeUsers() });
  };

  const handleUpdateStatus = async (ws: WebSocket, data: any) => {
    try {
      const status = data?.status;
      const userId = (ws as any).userId;

      if (!['online', 'in_match', 'away'].includes(status)) {
        presenceService.sendToSocket(ws, 'error', { error: 'Estado inválido' });
        return;
      }

      presenceService.updateUserStatus(userId, status);
      broadcastOnlineUsers();

      const userInfo = presenceService.getOnlineUsers().find(user => user.userId === userId);
      if (userInfo) {
        console.log(`👤 ${userInfo.username} cambió estado a: ${status}`);
      }
    } catch (error) {
      console.error('Error actualizando estado de usuario:', error);
    }
  };

  return { broadcastOnlineUsers, sendOnlineUsersList, handleUpdateStatus };
}
