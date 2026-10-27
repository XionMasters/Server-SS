// src/infrastructure/websocket/server.ts
// WebSocket nativo (no Socket.IO) para compatibilidad con Godot.
// Solo gestiona conexión, autenticación, heartbeat y enrutado; los handlers viven en interfaces/websocket.
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Match from '../database/models/Match';
import UserProfile from '../database/models/UserProfile';
import ProfileAvatar from '../database/models/ProfileAvatar';
import { matchesCoordinator } from '../../app/matches/coordinators/matchesCoordinator';
import { authenticateSocket, AuthenticatedWebSocket } from './middleware/auth.middleware';
import { WebSocketPresenceService } from './presence.service';
import { WebSocketChatHandler } from '../../interfaces/websocket/handlers/chat.handler';
import { WebSocketRouter, RouterEventHandler } from './websocket-router';
import { SocketRateLimiter } from './rate-limiter';
import {
  ADMIN_EVENTS,
  broadcastAdminStats,
  handleAdminDisconnectUser,
  handleAdminBlockUser,
  handleAdminUnblockUser
} from '../../interfaces/websocket/handlers/admin.handler';
import { createMatchHandlers } from '../../interfaces/websocket/handlers/match.handler';
import { createPresenceHandlers } from '../../interfaces/websocket/handlers/presence.handler';

const DEFAULT_AVATAR_URL = '/assets/avatars/avatar_1.png';
const MAX_MESSAGE_BYTES = 64 * 1024;

const presenceService = new WebSocketPresenceService();
const chatHandler = new WebSocketChatHandler(presenceService);
const router = new WebSocketRouter(matchesCoordinator, presenceService);
const presenceHandlers = createPresenceHandlers(presenceService);
const { broadcastOnlineUsers } = presenceHandlers;
const { handlers: matchHandlers, broadcastMatchUpdate } = createMatchHandlers(
  presenceService,
  async (ws, action) => {
    await router.route(ws as any, 'match_action', action);
  }
);

matchesCoordinator.setNotifier((userIds, event, payload) => {
  presenceService.sendToUsers(userIds, event, payload);
});

const withAdmin = (handler: RouterEventHandler): RouterEventHandler => {
  return async (ws, data) => {
    if (!ws.isAdmin) return;
    await handler(ws, data);
  };
};

// Mismo requisito que las rutas HTTP de partidas: email verificado
const withVerifiedEmail = (handler: RouterEventHandler): RouterEventHandler => {
  return async (ws, data) => {
    if (!ws.isEmailVerified) {
      presenceService.sendToSocket(ws as WebSocket, 'error', {
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Debes verificar tu email para realizar esta acción'
      });
      return;
    }
    await handler(ws, data);
  };
};

const verifiedMatchHandlers = Object.fromEntries(
  Object.entries(matchHandlers).map(([event, handler]) => [event, withVerifiedEmail(handler)])
);

router.registerMany({
  ...verifiedMatchHandlers,
  // Igual que GET /api/chat: el chat solo exige sesión, no email verificado
  chat_message: async (ws, data) => {
    await chatHandler.handleChatMessage(ws as any, data);
  },
  request_online_users: (ws) => {
    presenceHandlers.sendOnlineUsersList(ws as WebSocket);
  },
  update_status: async (ws, data) => {
    await presenceHandlers.handleUpdateStatus(ws as WebSocket, data);
  },
  get_admin_stats: withAdmin(async () => {
    await broadcastAdminStats(presenceService.getPrimarySocketsMap());
  }),
  admin_disconnect_user: withAdmin(async (_ws, data) => {
    await handleAdminDisconnectUser(data, presenceService.getPrimarySocketsMap());
  }),
  admin_block_user: withAdmin(async (_ws, data) => {
    await handleAdminBlockUser(data, presenceService.getPrimarySocketsMap(), presenceService.getSocketSetsMap());
  }),
  admin_unblock_user: withAdmin(async (_ws, data) => {
    await handleAdminUnblockUser(data, presenceService.getPrimarySocketsMap());
  }),
  ping: (ws) => {
    presenceService.sendToSocket(ws as WebSocket, 'pong', { ts: Date.now() });
  },
});

// El match_action genérico también exige email verificado
router.register('match_action', withVerifiedEmail(router.getHandler('match_action')!));

export { broadcastMatchUpdate };

async function resolveAvatarUrl(userId: string): Promise<string> {
  try {
    const userProfile = await UserProfile.findOne({ where: { user_id: userId } });

    let avatarUrl = '/assets/bronzes/1.webp';
    if (userProfile && userProfile.avatar_image_id) {
      const avatar = await ProfileAvatar.findByPk(userProfile.avatar_image_id);
      avatarUrl = avatar?.image_url || avatarUrl;
    }
    return avatarUrl.startsWith('http') ? avatarUrl : '/' + avatarUrl.replace(/^\//, '');
  } catch (error) {
    console.error('Error obteniendo avatar del usuario:', error);
    return DEFAULT_AVATAR_URL;
  }
}

/**
 * Autentica el socket y registra su presencia.
 * Devuelve true si el socket quedó listo para recibir eventos.
 */
async function setupConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): Promise<boolean> {
  try {
    const authResult = await authenticateSocket(ws, req);

    if (authResult.isAdmin) {
      await broadcastAdminStats(presenceService.getPrimarySocketsMap());
      return true;
    }

    const recoveryResult = await matchesCoordinator.recoverOnSocketConnect(
      ws.userId!,
      (userId: string) => presenceService.isUserOnline(userId)
    );

    if (!recoveryResult.success) {
      console.error('❌ Error en recuperación de partida:', recoveryResult.error || 'Unknown error');
    } else if ((recoveryResult.data?.cleanedWaitingCount ?? 0) > 0) {
      console.log(`🧹 Limpiando ${recoveryResult.data?.cleanedWaitingCount} partida(s) obsoleta(s) de ${ws.username}`);
    }

    const avatarUrl = await resolveAvatarUrl(ws.userId!);

    // El cliente pudo cerrar mientras autenticábamos: no registrar un usuario fantasma
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const resumed = recoveryResult.success ? recoveryResult.data?.matchResumed : null;
    if (resumed) {
      console.log(`♻️ ${ws.username} tiene partida activa para reanudar: ${resumed.match_id} (${resumed.phase})`);
      presenceService.sendToSocket(ws, 'match_resumed', resumed);
    }

    presenceService.registerConnection(ws, ws.userId!, ws.username!, avatarUrl);
    broadcastOnlineUsers();

    console.log(`✅ Usuario conectado: ${ws.username} (${ws.userId})`);

    presenceService.sendToSocket(ws, 'connected', {
      message: 'Conectado al servidor',
      user_id: ws.userId,
      username: ws.username,
      has_active_match: !!resumed
    });

    await broadcastAdminStats(presenceService.getPrimarySocketsMap());
    return true;
  } catch (error: any) {
    const code = error?.code || 'INVALID_TOKEN';
    const message = error?.message || 'Token inválido';
    console.error('❌ Error autenticación WebSocket:', message);
    presenceService.sendToSocket(ws, 'error', { code, message });
    ws.close(1008, code);
    return false;
  }
}

async function handleUserDisconnect(ws: AuthenticatedWebSocket, code: number, reason: Buffer) {
  console.log(`❌ Usuario desconectado: ${ws.username} code=${code} reason=${reason?.toString?.() || ''}`);
  presenceService.removeConnection(ws);
  broadcastOnlineUsers();

  if (!presenceService.isUserOnline(ws.userId!)) {
    const destroyed = await Match.destroy({
      where: { player1_id: ws.userId!, phase: 'waiting' }
    });
    if (destroyed > 0) {
      console.log(`🧹 Partida(s) en espera eliminada(s) de ${ws.username}: ${destroyed}`);
    }
  }

  await broadcastAdminStats(presenceService.getPrimarySocketsMap());
}

/**
 * Inicializa el servidor de WebSockets nativos
 */
export const initializeWebSocketServer = (server: any) => {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    // Ningún evento legítimo se acerca a esto (por defecto ws acepta 100 MB)
    maxPayload: MAX_MESSAGE_BYTES
  });

  console.log('🔌 WebSocket server initialized (native WS for Godot) at /ws');

  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        presenceService.removeConnection(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    // Los listeners se registran de inmediato para no perder mensajes ni cierres
    // ocurridos durante la autenticación; se procesan cuando `ready` se resuelve.
    const ready = setupConnection(ws, req);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    const rateLimiter = new SocketRateLimiter();

    ws.on('message', async (raw: Buffer) => {
      const decision = rateLimiter.check();
      if (decision === 'disconnect') {
        console.warn(`🚫 Cerrando socket de ${ws.username ?? 'desconocido'} por exceso de eventos`);
        ws.close(1008, 'RATE_LIMITED');
        return;
      }
      if (decision === 'reject') {
        presenceService.sendToSocket(ws, 'error', {
          code: 'RATE_LIMITED',
          message: 'Demasiados eventos, espera un momento'
        });
        return;
      }

      if (!(await ready)) return;

      try {
        const parsed = JSON.parse(raw.toString());
        if (!parsed.event) return;
        if (ws.isAdmin && !ADMIN_EVENTS.has(parsed.event)) return;

        if (parsed.event !== 'ping') {
          console.log(`📨 Evento recibido: ${parsed.event} de ${ws.username}`);
        }
        await router.route(ws as any, parsed.event, parsed.data || {});
      } catch (error: any) {
        console.error('Error procesando mensaje:', error);
        presenceService.sendToSocket(ws, 'error', {
          code: 'PARSE_ERROR',
          message: 'Error procesando mensaje'
        });
      }
    });

    ws.on('close', async (code: number, reason: Buffer) => {
      try {
        if (!(await ready) || ws.isAdmin || !ws.userId) return;
        await handleUserDisconnect(ws, code, reason);
      } catch (error) {
        console.error('Error gestionando desconexión:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};
