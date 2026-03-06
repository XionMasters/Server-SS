// src/services/websocket.service.ts
// WebSocket nativo (no Socket.IO) para compatibilidad con Godot
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Match from '../../models/Match';
import { GameStateBuilder } from '../game/GameStateBuilder';
import UserProfile from '../../models/UserProfile';
import ProfileAvatar from '../../models/ProfileAvatar';
import { MatchStateService } from '../match/matchState.service';
import { matchesCoordinator } from '../coordinators/matchesCoordinator';
import { authenticateSocket } from './websocket-auth.service';
import { WebSocketPresenceService } from './websocket-presence.service';
import { WebSocketChatService } from './websocket-chat.service';
import { WebSocketRouter, RouterEventHandler } from './websocket-router';
import {
  broadcastAdminStats,
  handleAdminDisconnectUser,
  handleAdminBlockUser
} from './websocket.panel';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAlive?: boolean;
  isAdmin?: boolean;
  isSearchingMatch?: boolean;
}

const presenceService = new WebSocketPresenceService();
const chatService = new WebSocketChatService(presenceService);
const router = new WebSocketRouter(matchesCoordinator, presenceService);

const withAdmin = (handler: RouterEventHandler): RouterEventHandler => {
  return async (ws, data) => {
    const authWs = ws as AuthenticatedWebSocket;
    if (!authWs.isAdmin) return;
    await handler(ws, data);
  };
};

const routeLegacyMatchAction = async (
  ws: AuthenticatedWebSocket,
  action: Record<string, any>
) => {
  await router.route(ws as any, 'match_action', action);
};

router.registerMany({
  request_test_match: async (ws) => {
    await handleRequestTestMatch(ws as AuthenticatedWebSocket);
  },
  resume_test_match: async (ws) => {
    await handleResumeTestMatch(ws as AuthenticatedWebSocket);
  },
  abandon_test_match: async (ws, data) => {
    await handleAbandonTestMatch(ws as AuthenticatedWebSocket, data as { match_id: string });
  },
  search_match: async (ws) => {
    await handleSearchMatch(ws as AuthenticatedWebSocket);
  },
  cancel_search: async (ws) => {
    await handleCancelSearch(ws as AuthenticatedWebSocket);
  },
  play_card: async (ws, data) => {
    await routeLegacyMatchAction(ws as AuthenticatedWebSocket, {
      type: 'PLAY_CARD',
      match_id: data.match_id,
      card_id: data.card_id,
      zone: data.zone,
      position: data.position,
      action_id: data.action_id
    });
  },
  declare_attack: async (ws, data) => {
    await routeLegacyMatchAction(ws as AuthenticatedWebSocket, {
      type: 'ATTACK',
      match_id: data.match_id,
      attacker_id: data.attacker_id,
      defender_id: data.defender_id,
      action_id: data.action_id
    });
  },
  end_turn: async (ws, data) => {
    await routeLegacyMatchAction(ws as AuthenticatedWebSocket, {
      type: 'END_TURN',
      match_id: data.match_id,
      action_id: data.action_id
    });
  },
  start_first_turn: async (ws, data) => {
    await routeLegacyMatchAction(ws as AuthenticatedWebSocket, {
      type: 'START_FIRST_TURN',
      match_id: data.match_id,
      action_id: data.action_id
    });
  },
  change_defensive_mode: async (ws, data) => {
    await routeLegacyMatchAction(ws as AuthenticatedWebSocket, {
      type: 'CHANGE_DEFENSIVE_MODE',
      match_id: data.match_id,
      knight_id: data.knight_id,
      mode: data.mode,
      action_id: data.action_id
    });
  },
  request_match_state: async (ws, data) => {
    await handleRequestMatchState(ws as AuthenticatedWebSocket, data);
  },
  chat_message: async (ws, data) => {
    await chatService.handleChatMessage(ws as any, data);
  },
  request_online_users: (ws) => {
    sendOnlineUsersList(ws as WebSocket);
  },
  update_status: async (ws, data) => {
    await handleUpdateStatus(ws as WebSocket, data);
  },
  get_admin_stats: withAdmin(async () => {
    await broadcastAdminStats(presenceService.getPrimarySocketsMap());
  }),
  admin_disconnect_user: withAdmin(async (_ws, data) => {
    await handleAdminDisconnectUser(data, presenceService.getPrimarySocketsMap());
  }),
  admin_block_user: withAdmin(async (_ws, data) => {
    await handleAdminBlockUser(data, presenceService.getPrimarySocketsMap());
  }),
  ping: (ws) => {
    // Responder al heartbeat del cliente
    presenceService.sendToSocket(ws as WebSocket, 'pong', { ts: Date.now() });
  },
});

// Matchmaking handler implementado más abajo (handleSearchMatch)
// (eliminada versión simplificada anterior)

/**
 * Inicializa el servidor de WebSockets nativos
 */
export const initializeWebSocketServer = (server: any) => {
  const wss = new WebSocketServer({
    server,
    path: '/ws'  // Ruta específica para WebSocket
  });

  console.log('🔌 WebSocket server initialized (native WS for Godot) at /ws');

  // Heartbeat para detectar conexiones muertas
  const interval = setInterval(() => {
    wss.clients.forEach((ws: AuthenticatedWebSocket) => {
      if (ws.isAlive === false) {
        presenceService.removeConnection(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000); // 30 segundos

  wss.on('close', () => {
    clearInterval(interval);
  });

  wss.on('connection', async (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Autenticación desde el header Authorization o query parameter
    try {
      const authResult = await authenticateSocket(ws, req);

      if (authResult.isAdmin) {
        return; // No continuar con autenticación de usuario normal
      }

      const recoveryResult = await matchesCoordinator.recoverOnSocketConnect(
        ws.userId!,
        (userId: string) => presenceService.isUserOnline(userId)
      );

      if (!recoveryResult.success) {
        console.error('❌ Error en recuperación de partida:', recoveryResult.error || 'Unknown error');
      } else if (recoveryResult.data?.cleanedWaitingCount > 0) {
        console.log(`🧹 Limpiando ${recoveryResult.data.cleanedWaitingCount} partida(s) obsoleta(s) de ${ws.username}`);
      }

      if (recoveryResult.success && recoveryResult.data?.matchResumed) {
        const resumed = recoveryResult.data.matchResumed;
        console.log(`♻️ ${ws.username} tiene partida activa para reanudar:`);
        console.log(`   - Match ID: ${resumed.match_id}`);
        console.log(`   - Fase: ${resumed.phase}`);
        console.log(`   - ${resumed.player1?.username} vs ${resumed.player2?.username}`);

        presenceService.sendToSocket(ws, 'match_resumed', resumed);
      }

      // Agregar usuario a la lista de usuarios en línea con su avatar
      let normalizedAvatarUrl = '/assets/avatars/avatar_1.png';
      try {
        const userProfile = await UserProfile.findOne({
          where: { user_id: ws.userId }
        });

        let avatarUrl = '/assets/bronzes/1.webp';
        if (userProfile && userProfile.avatar_image_id) {
          const avatar = await ProfileAvatar.findByPk(userProfile.avatar_image_id);
          avatarUrl = avatar?.image_url || avatarUrl;
        }
        normalizedAvatarUrl = avatarUrl.startsWith('http') ? avatarUrl : '/' + avatarUrl.replace(/^\//, '');
      } catch (error) {
        console.error('Error obteniendo avatar del usuario:', error);
        normalizedAvatarUrl = '/assets/avatars/avatar_1.png';
      }

      presenceService.registerConnection(ws, ws.userId!, ws.username!, normalizedAvatarUrl);
      broadcastOnlineUsers();

      console.log(`✅ Usuario conectado: ${ws.username} (${ws.userId})`);

      presenceService.sendToSocket(ws, 'connected', {
        message: 'Conectado al servidor',
        user_id: ws.userId,
        username: ws.username,
        has_active_match: !!(recoveryResult.success && recoveryResult.data?.matchResumed)
      });

      // Actualizar stats de admin
      await broadcastAdminStats(presenceService.getPrimarySocketsMap());

    } catch (error: any) {
      const code = error?.code || 'INVALID_TOKEN';
      const message = error?.message || 'Token inválido';
      console.error('❌ Error autenticación WebSocket:', message);
      presenceService.sendToSocket(ws, 'error', { code, message });
      ws.close(1008, message);
      return;
    }

    // =====================================
    // MANEJAR MENSAJES
    // =====================================
    ws.on('message', async (raw: Buffer) => {
      try {
        const parsed = JSON.parse(raw.toString());
        if (!parsed.event) return;

        if (parsed.event != 'ping') {
          console.log(`📨 Evento recibido: ${parsed.event} de ${ws.username}`);
        }
        await router.route(ws as any, parsed.event, parsed.data || {});


      } catch (error: any) {
        console.error('Error procesando mensaje:', error);
        if (ws.userId) {
          presenceService.sendToUser(ws.userId, 'error', {
            code: 'PARSE_ERROR',
            message: 'Error procesando mensaje'
          });
        }
      }
    });

    // =====================================
    // DESCONEXIÓN
    // =====================================
    ws.on('close', async (code: number, reason: Buffer) => {
      if (ws.userId && ws.username) {
        console.log(`❌ Usuario desconectado: ${ws.username} code=${code} reason=${reason?.toString?.() || ''}`);
        presenceService.removeConnection(ws);
        const userStillOnline = presenceService.isUserOnline(ws.userId);
        broadcastOnlineUsers();

        if (!userStillOnline) {
          const waitingMatch = await Match.findOne({
            where: {
              player1_id: ws.userId,
              phase: 'waiting'
            }
          });

          if (waitingMatch) {
            await waitingMatch.destroy();
            console.log(`🧹 Partida en espera eliminada: ${waitingMatch.id}`);
          }
        }

        // Actualizar stats de admin
        await broadcastAdminStats(presenceService.getPrimarySocketsMap());
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};

// =====================================
// HANDLERS DE EVENTOS
// =====================================

async function handleSearchMatch(ws: AuthenticatedWebSocket) {
  try {
    const userId = ws.userId!;
    const username = ws.username!;

    console.log(`🔍 ${username} busca partida...`);

    // 🎯 DELEGAMOS TODA LA LÓGICA AL COORDINADOR
    const result = await matchesCoordinator.findMatchOrCreate(
      userId,
      presenceService.getPrimarySocketsMap(),
      presenceService.getSocketSetsMap()
    );

    // Manejar respuesta según el resultado
    if (!result.success) {
      return presenceService.sendToSocket(ws, 'error', {
        code: 'SEARCH_ERROR',
        message: result.error || 'Error al buscar partida'
      });
    }

    // ✅ Match encontrado - notificar a cada jugador con su propia perspectiva
    if (result.status === 'match_found') {
      console.log(`✅ Match encontrado: ${result.match_id}`);

      const matchData = result.data;
      const player1Id = matchData.player1.id as string;
      const player2Id = matchData.player2.id as string;

      // Construir estado por perspectiva para cada jugador
      const matchRecord = await Match.findByPk(result.match_id);

      if (matchRecord) {
        const [gs1, gs2] = await Promise.all([
          GameStateBuilder.buildFromMatch(matchRecord, { perspectivePlayer: 1 }),
          GameStateBuilder.buildFromMatch(matchRecord, { perspectivePlayer: 2 })
        ]);
        presenceService.broadcastToUsers([player1Id], 'match_found', { match_id: result.match_id, game_state: gs1 });
        presenceService.broadcastToUsers([player2Id], 'match_found', { match_id: result.match_id, game_state: gs2 });
      } else {
        // Fallback: enviar datos originales (sin game_state) — iniciará con error gracioso
        const recipients = [player1Id, player2Id].filter(Boolean);
        presenceService.broadcastToUsers(recipients, 'match_found', matchData);
      }
    }
    // ⏳ En espera de rival
    else {
      console.log(`⏳ ${username} esperando rival... (Match ID: ${result.match_id})`);

      presenceService.sendToSocket(ws, 'searching', {
        message: 'Buscando rival...',
        match_id: result.match_id
      });
    }

    // Actualizar stats de admin
    await broadcastAdminStats(presenceService.getPrimarySocketsMap());

  } catch (error: any) {
    console.error('Error en search_match:', error);
    presenceService.sendToSocket(ws, 'error', {
      code: 'SEARCH_ERROR',
      message: 'Error al buscar partida'
    });
  }
}

async function handleCancelSearch(ws: AuthenticatedWebSocket) {
  try {
    const userId = ws.userId!;
    const username = ws.username!;

    console.log(`🔍 ${username} intenta cancelar búsqueda...`);

    const waitingMatch = await Match.findOne({
      where: {
        player1_id: userId,
        phase: 'waiting'
      }
    });

    if (waitingMatch) {
      console.log(`   - Partida encontrada: ${waitingMatch.id}`);
      await waitingMatch.destroy();
      console.log(`✅ ${username} canceló la búsqueda exitosamente`);

      presenceService.sendToSocket(ws, 'search_cancelled', {
        success: true,
        message: 'Búsqueda cancelada'
      });

      // Actualizar stats de admin
      await broadcastAdminStats(presenceService.getPrimarySocketsMap());
    } else {
      console.log(`⚠️ ${username} no tiene partida en espera para cancelar`);
      presenceService.sendToSocket(ws, 'search_cancelled', {
        success: false,
        message: 'No hay búsqueda activa'
      });
    }
  } catch (error) {
    console.error('Error cancelando búsqueda:', error);
    presenceService.sendToSocket(ws, 'error', {
      code: 'CANCEL_ERROR',
      message: 'Error al cancelar búsqueda'
    });
  }
}

async function handleRequestMatchState(ws: AuthenticatedWebSocket, data: any) {
  try {
    const userId = ws.userId!;
    const matchId = data?.match_id;

    if (!matchId) {
      presenceService.sendToSocket(ws, 'error', {
        code: 'MATCH_ID_REQUIRED',
        message: 'match_id es requerido'
      });
      return;
    }

    const result = await matchesCoordinator.getMatchState(matchId, userId);

    if (!result.success) {
      presenceService.sendToSocket(ws, 'error', {
        code: (result as any).code || 'MATCH_STATE_ERROR',
        message: result.error || 'Error obteniendo estado de partida'
      });
      return;
    }

    presenceService.sendToSocket(ws, 'match_state', result.data);
  } catch (error: any) {
    console.error('Error en request_match_state:', error);
    presenceService.sendToSocket(ws, 'error', {
      code: 'MATCH_STATE_ERROR',
      message: 'Error obteniendo estado de partida'
    });
  }
}

// ==================== PRESENCE HANDLERS ====================

async function handleUpdateStatus(ws: WebSocket, data: any) {
  try {
    const { status } = data;
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
}

function sendOnlineUsersList(ws: WebSocket) {
  const users = presenceService.getOnlineUsers().map(u => ({
    user_id: u.userId,
    username: u.username,
    avatar_url: u.avatarUrl || '/assets/avatars/avatar_1.png',
    status: u.status,
    connected_at: u.connectedAt.toISOString()
  }));
  presenceService.sendToSocket(ws, 'online_users', { users });
}

function broadcastOnlineUsers() {
  const users = presenceService.getOnlineUsers().map(u => ({
    user_id: u.userId,
    username: u.username,
    avatar_url: u.avatarUrl || '/assets/avatars/avatar_1.png',
    status: u.status,
    connected_at: u.connectedAt.toISOString()
  }));
  presenceService.broadcast('online_users', { users });
  console.log(`📡 Broadcast: ${users.length} usuarios en línea`);
}

/**
 * Broadcast de actualización de partida a ambos jugadores
 */
export async function broadcastMatchUpdate(matchId: string) {
  try {
    const matchStateResult = await MatchStateService.buildBroadcastMatchState(matchId);
    if (!matchStateResult.success || !matchStateResult.data) {
      console.error('❌ Error construyendo estado para broadcast:', matchStateResult.error || matchId);
      return;
    }

    const matchState = matchStateResult.data;
    const recipients = [matchState.player1_id, matchState.player2_id].filter(Boolean);
    presenceService.broadcastToUsers(recipients, 'match_update', matchState);

    console.log(`📡 Match update broadcast: ${matchId}`);
  } catch (error) {
    console.error('Error broadcasting match update:', error);
  }
}

/**
 * TEST Match Handler - Usuario quiere jugar contra sí mismo
 */
async function handleRequestTestMatch(ws: AuthenticatedWebSocket) {
  try {
    console.log(`🎭 ${ws.username} solicita partida TEST`);

    const userId = ws.userId!;

    // Usar StartMatchService que centraliza toda la lógica
    const { StartMatchService } = await import('../match/startMatch.service');
    const result = await StartMatchService.createNewMatch(userId, userId, 'TEST');

    // Enviar match_found event al cliente con el estado construido
    console.log(`📡 Enviando match_found a ${ws.username}...`);
    presenceService.sendToSocket(ws, 'match_found', result);
    console.log(`✅ match_found enviada a ${ws.username}`);

  } catch (error: any) {
    console.error('❌ Error en handleRequestTestMatch:', error);

    // Adaptar mensajes de error comunes
    let errorMessage = 'Error creando partida TEST';
    let errorCode = 'TEST_MATCH_ERROR';

    if (error.message.includes('mazo activo')) {
      errorCode = 'NO_ACTIVE_DECK';
      errorMessage = error.message;
    } else if (error.message.includes('activa en curso') || error.message.includes('partida activa') || error.message.includes('ALREADY_IN_MATCH')) {
      errorCode = 'ALREADY_IN_MATCH';
      errorMessage = error.message;
    } else if (error.message.includes('esperando')) {
      errorCode = 'RATE_LIMIT';
      errorMessage = error.message;
    }

    presenceService.sendToSocket(ws, 'match_error', {
      code: errorCode,
      message: errorMessage,
      error: error.message
    });
  }
}

/**
 * Reanudar partida TEST activa
 */
async function handleResumeTestMatch(ws: AuthenticatedWebSocket) {
  try {
    console.log(`♻️ ${ws.username} solicita reanudar partida TEST`);
    const { StartMatchService } = await import('../match/startMatch.service');
    const result = await StartMatchService.resumeTestMatch(ws.userId!);

    presenceService.sendToSocket(ws, 'match_found', result);
    console.log(`✅ match_found (resume) enviada a ${ws.username}`);
  } catch (error: any) {
    console.error('❌ Error en handleResumeTestMatch:', error);
    presenceService.sendToSocket(ws, 'match_error', {
      code: 'RESUME_ERROR',
      message: error.message || 'Error reanudando partida TEST',
      error: error.message
    });
  }
}

/**
 * Abandonar partida TEST activa y crear una nueva
 */
async function handleAbandonTestMatch(ws: AuthenticatedWebSocket, data: { match_id: string }) {
  try {
    console.log(`🗑️ ${ws.username} abandonando partida TEST: ${data.match_id}`);
    const result = await matchesCoordinator.abandonMatch(data.match_id, ws.userId!);

    if (!result.success) {
      throw new Error(result.error || 'Error abandonando partida');
    }

    console.log(`✅ Partida abandonada, creando nueva TEST...`);
    // Crear nueva partida TEST inmediatamente
    await handleRequestTestMatch(ws);
  } catch (error: any) {
    console.error('❌ Error en handleAbandonTestMatch:', error);
    presenceService.sendToSocket(ws, 'match_error', {
      code: 'ABANDON_ERROR',
      message: error.message || 'Error abandonando partida TEST',
      error: error.message
    });
  }
}
