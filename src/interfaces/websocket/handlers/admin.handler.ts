// src/interfaces/websocket/handlers/admin.handler.ts
// Admin Panel Dashboard - eventos WebSocket del panel
import { Op } from 'sequelize';
import { WebSocket } from 'ws';
import User from '../../../infrastructure/database/models/User';
import Match from '../../../infrastructure/database/models/Match';
import { verifyAdminAccessToken } from '../../../infrastructure/auth/token.service';
import { deactivateAllUserSessions } from '../../../infrastructure/auth/session.service';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAlive?: boolean;
  isAdmin?: boolean;
  isSearchingMatch?: boolean;
}

// Eventos que un socket admin puede enviar
export const ADMIN_EVENTS = new Set(['get_admin_stats', 'admin_disconnect_user', 'admin_block_user', 'admin_unblock_user', 'ping']);

// Lista de sockets de admin para broadcast de stats
export const adminSockets = new Set<AuthenticatedWebSocket>();

/**
 * Envía un evento al cliente
 */
function sendEvent(ws: WebSocket, event: string, data: any = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

/**
 * Broadcast de estadísticas del admin a todos los admins conectados
 * Se llama cada vez que cambia el estado (usuario conectado, match encontrado, etc)
 */
export async function broadcastAdminStats(userSockets: Map<string, AuthenticatedWebSocket>) {
  if (adminSockets.size === 0) return;

  try {
    // Obtener usuarios conectados
    const connectedUsers = Array.from(userSockets.entries()).map(([userId, ws]) => ({
      id: userId,
      username: ws.username
    }));

    // Obtener usuarios buscando partida
    const searchingMatches = await Match.findAll({
      where: { phase: 'waiting' },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] }
      ]
    });

    const searchingUsers = searchingMatches.map(match => {
      const player1 = match.get('player1') as any;
      return {
        id: player1?.id,
        username: player1?.username
      };
    });

    // Obtener partidas activas
    const activeMatches = await Match.findAll({
      where: {
        phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] }
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ],
      order: [['created_at', 'DESC']]
    });

    const matchesData = activeMatches.map(match => {
      const player1 = match.get('player1') as any;
      const player2 = match.get('player2') as any;

      return {
        id: match.id,
        phase: match.phase,
        player1_id: match.player1_id,
        player1_username: player1?.username,
        player2_id: match.player2_id,
        player2_username: player2?.username,
        created_at: match.created_at
      };
    });

    const blockedUsers = (await User.findAll({
      where: { blocked_at: { [Op.ne]: null } },
      attributes: ['id', 'username', 'blocked_at'],
      order: [['blocked_at', 'DESC']],
      limit: 100,
    })).map((user) => ({ id: user.id, username: user.username, blocked_at: user.blocked_at }));

    const stats = {
      connectedUsers,
      searchingUsers,
      blockedUsers,
      activeMatches: matchesData,
      timestamp: new Date().toISOString()
    };

    // Enviar a todos los admins conectados
    adminSockets.forEach(adminWs => {
      sendEvent(adminWs, 'admin_stats', stats);
    });

  } catch (error) {
    console.error('Error broadcasting admin stats:', error);
  }
}

/**
 * Valida el token de admin y registra el socket.
 * No cierra el socket ni envía stats: de eso se encarga el servidor,
 * que es quien conoce los sockets de usuario conectados.
 */
export async function handleAdminAuthentication(
  ws: AuthenticatedWebSocket,
  adminToken: string | undefined
): Promise<boolean> {
  if (!adminToken) {
    return false;
  }

  try {
    verifyAdminAccessToken(adminToken);
  } catch (error) {
    console.error('Token de admin inválido:', error);
    return false;
  }

  ws.isAdmin = true;
  adminSockets.add(ws);
  console.log('✅ Admin conectado al dashboard');

  sendEvent(ws, 'connected', {
    message: 'Admin conectado',
    role: 'admin'
  });

  ws.on('close', () => {
    adminSockets.delete(ws);
    console.log('❌ Admin desconectado del dashboard');
  });

  return true;
}

/**
 * Desconecta un usuario (comando de admin)
 */
export async function handleAdminDisconnectUser(
  data: any,
  userSockets: Map<string, AuthenticatedWebSocket>
) {
  try {
    const { user_id } = data;

    if (!user_id) {
      console.log('⚠️ Admin: user_id no proporcionado para desconectar');
      return;
    }

    const ws = userSockets.get(user_id);

    if (ws) {
      console.log(`🔨 Admin desconectando a usuario: ${ws.username}`);
      sendEvent(ws, 'admin_disconnect', {
        message: 'Has sido desconectado por un administrador'
      });
      ws.close(1000, 'Desconectado por administrador');

      // El evento 'close' del socket limpiará todo automáticamente
    } else {
      console.log(`⚠️ Admin: Usuario ${user_id} no está conectado`);
    }

    // Actualizar stats
    await broadcastAdminStats(userSockets);
  } catch (error) {
    console.error('Error desconectando usuario:', error);
  }
}

/**
 * Bloquea un usuario (comando de admin).
 * El bloqueo se persiste en users.blocked_at y se revocan sus sesiones:
 * login, HTTP y WebSocket lo rechazan hasta que se desbloquee.
 */
export async function handleAdminBlockUser(
  data: any,
  userSockets: Map<string, AuthenticatedWebSocket>,
  userSocketSets?: Map<string, Set<AuthenticatedWebSocket>>
) {
  try {
    const { user_id } = data;

    if (!user_id) {
      console.log('⚠️ Admin: user_id no proporcionado para bloquear');
      return;
    }

    const user = await User.findByPk(user_id);

    if (!user) {
      console.log(`⚠️ Admin: Usuario ${user_id} no existe`);
      return;
    }

    console.log(`🚫 Admin bloqueando a usuario: ${user.username}`);

    user.blocked_at = new Date();
    await user.save();
    await deactivateAllUserSessions(user.id);

    // Cerrar todos sus sockets abiertos, no solo el principal
    const sockets = userSocketSets?.get(user_id) ?? new Set([userSockets.get(user_id)].filter(Boolean) as AuthenticatedWebSocket[]);
    for (const ws of [...sockets]) {
      sendEvent(ws, 'admin_blocked', {
        message: 'Tu cuenta ha sido bloqueada por un administrador'
      });
      ws.close(1008, 'USER_BLOCKED');
    }

    // Actualizar stats
    await broadcastAdminStats(userSockets);
  } catch (error) {
    console.error('Error bloqueando usuario:', error);
  }
}

/**
 * Desbloquea un usuario (comando de admin). Debe volver a iniciar sesión.
 */
export async function handleAdminUnblockUser(
  data: any,
  userSockets: Map<string, AuthenticatedWebSocket>
) {
  try {
    const { user_id } = data;
    if (!user_id) return;

    const user = await User.findByPk(user_id);
    if (!user) return;

    user.blocked_at = null;
    await user.save();
    console.log(`✅ Admin desbloqueó a usuario: ${user.username}`);

    await broadcastAdminStats(userSockets);
  } catch (error) {
    console.error('Error desbloqueando usuario:', error);
  }
}
