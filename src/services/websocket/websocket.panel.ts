// src/services/websocket/websocket.panel.ts
// Admin Panel Dashboard - Lógica centralizada
import * as jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { WebSocket } from 'ws';
import User from '../../models/User';
import Match from '../../models/Match';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAlive?: boolean;
  isAdmin?: boolean;
  isSearchingMatch?: boolean;
}

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
        id: player1.id,
        username: player1.username
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

    const stats = {
      connectedUsers,
      searchingUsers,
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
 * Maneja la autenticación de admin en la conexión WebSocket
 */
export async function handleAdminAuthentication(
  ws: AuthenticatedWebSocket,
  adminToken: string | undefined,
  onAdminConnected?: () => void
): Promise<boolean> {
  if (!adminToken) {
    return false;
  }

  try {
    const jwtSecret = process.env.JWT_SECRET || 'secret-key-change-in-production';
    const decoded = jwt.verify(adminToken, jwtSecret) as any;
    
    if (decoded.role === 'admin') {
      ws.isAdmin = true;
      adminSockets.add(ws);
      console.log('✅ Admin conectado al dashboard');
      
      sendEvent(ws, 'connected', { 
        message: 'Admin conectado',
        role: 'admin'
      });
      
      // Enviar stats iniciales
      const { broadcastAdminStats: broadcast } = await import('./websocket.panel');
      await broadcast(new Map()); // Se pasa vacío porque se usa dentro
      
      // Manejar mensajes de admin
      ws.on('message', (message: string) => {
        try {
          const { event } = JSON.parse(message);
          if (event === 'get_admin_stats') {
            broadcast(new Map());
          }
        } catch (err) {
          console.error('Error parsing admin message:', err);
        }
      });
      
      ws.on('close', () => {
        adminSockets.delete(ws);
        console.log('❌ Admin desconectado del dashboard');
      });
      
      if (onAdminConnected) {
        onAdminConnected();
      }
      
      return true;
    }
  } catch (error) {
    console.error('Token de admin inválido:', error);
    sendEvent(ws, 'error', { code: 'INVALID_ADMIN_TOKEN', message: 'Token de admin inválido' });
    ws.close(1008, 'Token de admin inválido');
    return false;
  }

  return false;
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
 * Bloquea un usuario (comando de admin)
 */
export async function handleAdminBlockUser(
  data: any,
  userSockets: Map<string, AuthenticatedWebSocket>
) {
  try {
    const { user_id } = data;
    
    if (!user_id) {
      console.log('⚠️ Admin: user_id no proporcionado para bloquear');
      return;
    }

    // Buscar usuario en la base de datos
    const user = await User.findByPk(user_id);
    
    if (!user) {
      console.log(`⚠️ Admin: Usuario ${user_id} no existe`);
      return;
    }

    // Agregar campo 'blocked' si no existe (necesitarías agregarlo al modelo)
    // Por ahora solo desconectamos y dejamos registro
    console.log(`🚫 Admin bloqueando a usuario: ${user.username}`);
    
    // Desconectar al usuario
    const ws = userSockets.get(user_id);
    if (ws) {
      sendEvent(ws, 'admin_blocked', { 
        message: 'Tu cuenta ha sido bloqueada por un administrador' 
      });
      ws.close(1008, 'Usuario bloqueado');
    }
    
    // Actualizar stats
    await broadcastAdminStats(userSockets);
  } catch (error) {
    console.error('Error bloqueando usuario:', error);
  }
}
