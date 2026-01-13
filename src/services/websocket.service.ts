// src/services/websocket.service.ts
// WebSocket nativo (no Socket.IO) para compatibilidad con Godot
import { IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '../models/User';
import Match from '../models/Match';
import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardInPlay from '../models/CardInPlay';
import ChatMessage from '../models/ChatMessage';
import UserProfile from '../models/UserProfile';
import ProfileAvatar from '../models/ProfileAvatar';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  username?: string;
  isAlive?: boolean;
  isAdmin?: boolean;
  isSearchingMatch?: boolean;
}

// Mapeo de userId -> WebSocket (última conexión) para notificaciones directas
const userSockets = new Map<string, AuthenticatedWebSocket>();
// Mapeo de userId -> Set de WebSockets activos (permite múltiples conexiones por usuario)
const userSocketSets = new Map<string, Set<AuthenticatedWebSocket>>();

// Mapeo de WebSocket -> userId para cleanup
const socketUsers = new Map<AuthenticatedWebSocket, string>();

// Lista de sockets de admin para broadcast de stats
const adminSockets = new Set<AuthenticatedWebSocket>();

// Tracking de usuarios conectados con metadata
interface OnlineUser {
  userId: string;
  username: string;
  avatarUrl?: string;
  connectedAt: Date;
  status: 'online' | 'in_match' | 'away';
}

const onlineUsers = new Map<string, OnlineUser>();

/**
 * Envía un evento al cliente
 */
function sendEvent(ws: WebSocket, event: string, data: any = {}) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event, data }));
  }
}

// Matchmaking handler implementado más abajo (handleSearchMatch)
// (eliminada versión simplificada anterior)

/**
 * Inicializa las cartas en juego cuando comienza la partida
 */
async function initializeMatchCards(match: any, player1DeckId: string, player2DeckId: string) {
  try {
    console.log(`🎴 Inicializando cartas para partida ${match.id}...`);
    
    // Obtener todas las cartas del deck (respetando la cantidad/quantity)
    const deck1Cards = await DeckCard.findAll({ where: { deck_id: player1DeckId } });
    const deck2Cards = await DeckCard.findAll({ where: { deck_id: player2DeckId } });

    // Expandir la lista según quantity para reflejar copias reales
    const expandByQuantity = (cards: DeckCard[]) => {
      const expanded: string[] = [];
      for (const dc of cards) {
        const qty = (dc as any).quantity ?? 1;
        for (let i = 0; i < qty; i++) expanded.push((dc as any).card_id);
      }
      return expanded;
    };

    const deck1ExpandedIds = expandByQuantity(deck1Cards);
    const deck2ExpandedIds = expandByQuantity(deck2Cards);

    console.log(`   - Jugador 1: ${deck1ExpandedIds.length} cartas (expandidas por quantity)`);
    console.log(`   - Jugador 2: ${deck2ExpandedIds.length} cartas (expandidas por quantity)`);
    
    // Función para hacer shuffle (Fisher-Yates)
    function shuffleArray(array: any[]): any[] {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    
    // Shuffle ambas decks
    const shuffledDeck1 = shuffleArray(deck1ExpandedIds);
    const shuffledDeck2 = shuffleArray(deck2ExpandedIds);
    
    // Guardar orden en Match
    // Ya son IDs de carta
    const deck1Order = shuffledDeck1;
    const deck2Order = shuffledDeck2;
    
    match.player1_deck_order = JSON.stringify(deck1Order);
    match.player2_deck_order = JSON.stringify(deck2Order);
    match.player1_deck_index = 7; // Índice después de las 7 iniciales
    match.player2_deck_index = 7;
    await match.save();
    
    console.log(`✅ Deck shuffled y guardado en Match`);
    
    // Crear CardInPlay: 7 cartas en mano (índices 0-6), resto en deck
    const cardsInPlayData: any[] = [];
    
    // Cartas del Jugador 1 - 7 en mano
    for (let i = 0; i < 7; i++) {
      cardsInPlayData.push({
        match_id: match.id,
        card_id: deck1Order[i],
        player_number: 1,
        zone: 'hand',
        position: i,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }
    
    // Cartas del Jugador 1 - resto en deck
    for (let i = 7; i < deck1Order.length; i++) {
      cardsInPlayData.push({
        match_id: match.id,
        card_id: deck1Order[i],
        player_number: 1,
        zone: 'deck',
        position: i - 7,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }
    
    // Cartas del Jugador 2 - 7 en mano
    for (let i = 0; i < 7; i++) {
      cardsInPlayData.push({
        match_id: match.id,
        card_id: deck2Order[i],
        player_number: 2,
        zone: 'hand',
        position: i,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }
    
    // Cartas del Jugador 2 - resto en deck
    for (let i = 7; i < deck2Order.length; i++) {
      cardsInPlayData.push({
        match_id: match.id,
        card_id: deck2Order[i],
        player_number: 2,
        zone: 'deck',
        position: i - 7,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }
    
    if (cardsInPlayData.length > 0) {
      await CardInPlay.bulkCreate(cardsInPlayData);
      console.log(`✅ ${cardsInPlayData.length} cartas creadas en CardInPlay (14 en mano, resto en deck)`);
    }
  } catch (error) {
    console.error('❌ Error inicializando cartas:', error);
  }
}

function serializeCardInPlay(cardInPlay: any) {
  const card = cardInPlay.get('card') as any;
  const knight = card?.card_knight;
  
  const cardData: any = {
    id: card?.id,
    name: card?.name,
    type: card?.type,
    rarity: card?.rarity,
    cost: card?.cost,
    generate: card?.generate,
    image_url: card?.image_url,
    description: card?.description,
    faction: card?.faction || "",
    element: card?.element || ""
  };
  
  // Agregar stats de knight si existen
  if (knight) {
    cardData.card_knight = {
      attack: knight.attack || 0,
      defense: knight.defense || 0,
      health: knight.health || 0,
      cosmos: knight.cosmos || 0,
      can_defend: knight.can_defend !== undefined ? knight.can_defend : true,
      defense_reduction: knight.defense_reduction || 0.5
    };
  }
  
  return {
    id: cardInPlay.id,
    card_id: cardInPlay.card_id,
    player_number: cardInPlay.player_number,
    zone: cardInPlay.zone,
    position: cardInPlay.position,
    is_defensive_mode: cardInPlay.is_defensive_mode,
    current_attack: cardInPlay.current_attack,
    current_defense: cardInPlay.current_defense,
    current_health: cardInPlay.current_health,
    current_cosmos: cardInPlay.current_cosmos,
    can_attack_this_turn: cardInPlay.can_attack_this_turn,
    has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
    card: cardData
  };
}

const MAX_COSMOS_PER_PLAYER = 12;

function awardBluePoint(match: Match, playerNumber: 1 | 2, amount: number = 1) {
  const clampCosmos = (current: number | undefined) =>
    Math.min((current ?? 0) + amount, MAX_COSMOS_PER_PLAYER);

  if (playerNumber === 1) {
    match.player1_cosmos = clampCosmos(match.player1_cosmos);
  } else {
    match.player2_cosmos = clampCosmos(match.player2_cosmos);
  }

  console.log(
    `   ✨ Jugador ${playerNumber} recibe ${amount} punto azul (cosmos=${
      playerNumber === 1 ? match.player1_cosmos : match.player2_cosmos
    })`
  );
}

// =====================================
// ADMIN DASHBOARD
// =====================================

async function broadcastAdminStats() {
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
        socketUsers.delete(ws);
        if (ws.userId) userSockets.delete(ws.userId);
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
      let token: string | undefined;
      let adminToken: string | undefined;
      
      // Intentar obtener token del header Authorization
      const authHeader = req.headers.authorization;
      if (authHeader) {
        token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
      }
      
      // Si no hay header, intentar obtener del query parameter
      if (!token && req.url) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        token = url.searchParams.get('token') || undefined;
        adminToken = url.searchParams.get('admin_token') || undefined;
      }
      
      // Verificar si es admin
      if (adminToken) {
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
            broadcastAdminStats();
            
            // Manejar mensajes de admin
            ws.on('message', (message: string) => {
              try {
                const { event } = JSON.parse(message);
                if (event === 'get_admin_stats') {
                  broadcastAdminStats();
                }
              } catch (err) {
                console.error('Error parsing admin message:', err);
              }
            });
            
            ws.on('close', () => {
              adminSockets.delete(ws);
              console.log('❌ Admin desconectado del dashboard');
            });
            
            return; // No continuar con autenticación de usuario normal
          }
        } catch (error) {
          console.error('Token de admin inválido:', error);
          sendEvent(ws, 'error', { code: 'INVALID_ADMIN_TOKEN', message: 'Token de admin inválido' });
          ws.close(1008, 'Token de admin inválido');
          return;
        }
      }
      
      if (!token) {
        sendEvent(ws, 'error', { code: 'NO_TOKEN', message: 'Token no proporcionado' });
        ws.close(1008, 'Token no proporcionado');
        return;
      }

      const jwtSecret = process.env.JWT_SECRET || 'secret-key-change-in-production';
      
      const decoded = jwt.verify(token, jwtSecret) as any;
      
      // Verificar que el usuario existe
      const user = await User.findByPk(decoded.userId);
      if (!user) {
        sendEvent(ws, 'error', { code: 'USER_NOT_FOUND', message: 'Usuario no encontrado' });
        ws.close(1008, 'Usuario no encontrado');
        return;
      }

      ws.userId = decoded.userId;
      ws.username = user.username;
      
      // ===== PERMITIR MÚLTIPLES CONEXIONES POR USUARIO =====
      // Registrar socket en set del usuario
      const set = userSocketSets.get(ws.userId!) || new Set<AuthenticatedWebSocket>();
      set.add(ws);
      userSocketSets.set(ws.userId!, set);

      // ===== LIMPIEZA DE PARTIDAS AL RECONECTAR =====
      // Buscar partidas donde el usuario está solo esperando (waiting)
      const oldMatches = await Match.findAll({
        where: {
          player1_id: ws.userId,
          phase: 'waiting'
        }
      });

      if (oldMatches.length > 0) {
        console.log(`🧹 Limpiando ${oldMatches.length} partida(s) obsoleta(s) de ${ws.username}`);
        for (const match of oldMatches) {
          await match.destroy();
          console.log(`   - Eliminada partida: ${match.id} (fase: ${match.phase})`);
        }
      }

      // Verificar si tiene una partida REAL activa (con ambos jugadores conectados)
      const activeMatch = await Match.findOne({
        where: {
          [Op.or]: [
            { 
              player1_id: ws.userId, 
              phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
            },
            { 
              player2_id: ws.userId, 
              phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
            }
          ]
        },
        include: [
          { model: User, as: 'player1', attributes: ['id', 'username'] },
          { model: User, as: 'player2', attributes: ['id', 'username'] }
        ]
      });

      if (activeMatch) {
        const player1 = activeMatch.get('player1') as any;
        const player2 = activeMatch.get('player2') as any;
        
        // Verificar que ambos jugadores existan (partida válida)
        if (!player1 || !player2) {
          console.log(`🧹 Partida inválida (falta jugador en BD), eliminando: ${activeMatch.id}`);
          await activeMatch.destroy();
        } else {
          // Verificar que el OTRO jugador esté conectado
          const otherPlayerId = activeMatch.player1_id === ws.userId ? activeMatch.player2_id : activeMatch.player1_id;
          const otherPlayerSocket = userSockets.get(otherPlayerId!);
          
          if (!otherPlayerSocket) {
            console.log(`🧹 Partida inválida (otro jugador desconectado), eliminando: ${activeMatch.id}`);
            console.log(`   - ${player1.username} vs ${player2.username}`);
            console.log(`   - Jugador desconectado: ${otherPlayerId === activeMatch.player1_id ? player1.username : player2.username}`);
            await activeMatch.destroy();
          } else {
            console.log(`♻️ ${ws.username} tiene partida activa para reanudar:`);
            console.log(`   - Match ID: ${activeMatch.id}`);
            console.log(`   - Fase: ${activeMatch.phase}`);
            console.log(`   - ${player1?.username} vs ${player2?.username}`);
            console.log(`   - Ambos jugadores CONECTADOS ✅`);
            
            // Enviar información de la partida activa
            sendEvent(ws, 'match_resumed', {
              match_id: activeMatch.id,
              phase: activeMatch.phase,
              player1: {
                id: activeMatch.player1_id,
                username: player1?.username
              },
              player2: {
                id: activeMatch.player2_id,
                username: player2?.username
              },
              player1_life: activeMatch.player1_life,
              player2_life: activeMatch.player2_life,
              player1_cosmos: activeMatch.player1_cosmos,
              player2_cosmos: activeMatch.player2_cosmos,
              current_turn: activeMatch.current_turn,
              current_player: activeMatch.current_player
            });
          }
        }
      }
      
      // Registrar socket del usuario (marcar esta conexión como la "principal")
      userSockets.set(ws.userId!, ws);
      socketUsers.set(ws, ws.userId!);
      console.log(`   [DBG] Registrado socket para ${ws.username} (${ws.userId}). userSockets.size=${userSockets.size}`);

      // Agregar usuario a la lista de usuarios en línea con su avatar
      try {
        const userProfile = await UserProfile.findOne({
          where: { user_id: ws.userId }
        });

        let avatarUrl = '/assets/bronzes/1.webp';
        if (userProfile && userProfile.avatar_image_id) {
          const avatar = await ProfileAvatar.findByPk(userProfile.avatar_image_id);
          avatarUrl = avatar?.image_url || avatarUrl;
        }

        onlineUsers.set(ws.userId!, {
          userId: ws.userId!,
          username: ws.username!,
          avatarUrl: avatarUrl.startsWith('http') ? avatarUrl : '/' + avatarUrl.replace(/^\//, ''),
          connectedAt: new Date(),
          status: 'online'
        });
        broadcastOnlineUsers();
      } catch (error) {
        console.error('Error obteniendo avatar del usuario:', error);
        // Agregar usuario sin avatar
        onlineUsers.set(ws.userId!, {
          userId: ws.userId!,
          username: ws.username!,
          avatarUrl: '/assets/avatars/avatar_1.png',
          connectedAt: new Date(),
          status: 'online'
        });
        broadcastOnlineUsers();
      }

      console.log(`✅ Usuario conectado: ${ws.username} (${ws.userId})`);
      
      sendEvent(ws, 'connected', { 
        message: 'Conectado al servidor',
        user_id: ws.userId,
        username: ws.username,
        has_active_match: activeMatch && activeMatch.player1_id && activeMatch.player2_id ? true : false
      });
      
      // Actualizar stats de admin
      broadcastAdminStats();

    } catch (error: any) {
      console.error('❌ Error autenticación WebSocket:', error.message);
      sendEvent(ws, 'error', { code: 'INVALID_TOKEN', message: 'Token inválido' });
      ws.close(1008, 'Token inválido');
      return;
    }

    // =====================================
    // MANEJAR MENSAJES
    // =====================================
    ws.on('message', async (data: Buffer) => {
      try {
        const message = data.toString();
        const parsed = JSON.parse(message);
        
        if (!parsed.event) {
          return;
        }

        const event = parsed.event;
        const eventData = parsed.data || {};

        console.log(`📨 Evento recibido: ${event} de ${ws.username}`);

        switch (event) {
          case 'check_can_search':
            await handleCheckCanSearch(ws);
            break;
          case 'request_test_match':
            await handleRequestTestMatch(ws);
            break;
          case 'search_match':
            await handleSearchMatch(ws);
            break;
          case 'cancel_search':
            handleCancelSearch(ws);
            break;
          case 'play_card':
            await handlePlayCard(ws, eventData);
            break;
          case 'declare_attack':
            await handleDeclareAttack(ws, eventData);
            break;
          case 'end_turn':
            await handleEndTurn(ws, eventData);
            break;
          case 'chat_message':
            await handleChatMessage(ws, eventData);
            break;
          case 'request_online_users':
            sendOnlineUsersList(ws);
            break;
          case 'update_status':
            await handleUpdateStatus(ws, eventData);
            break;
          case 'get_admin_stats':
            // Solo admins pueden solicitar stats
            if (ws.isAdmin) {
              await broadcastAdminStats();
            }
            break;
          case 'admin_disconnect_user':
            if (ws.isAdmin) {
              await handleAdminDisconnectUser(eventData);
            }
            break;
          case 'admin_block_user':
            if (ws.isAdmin) {
              await handleAdminBlockUser(eventData);
            }
            break;
          default:
            console.log(`⚠️ Evento desconocido: ${event}`);
        }

      } catch (error: any) {
        console.error('Error procesando mensaje:', error);
        sendEvent(ws, 'error', { code: 'PARSE_ERROR', message: 'Error procesando mensaje' });
      }
    });

    // =====================================
    // DESCONEXIÓN
    // =====================================
    ws.on('close', async (code: number, reason: Buffer) => {
      if (ws.userId && ws.username) {
        console.log(`❌ Usuario desconectado: ${ws.username} code=${code} reason=${reason?.toString?.() || ''}`);
        // Remover de set de sockets
        const set = userSocketSets.get(ws.userId);
        if (set) {
          set.delete(ws);
          if (set.size === 0) {
            userSocketSets.delete(ws.userId);
          } else {
            // Si aún quedan sockets, actualizar userSockets a cualquiera abierto
            const another = Array.from(set).find(s => s.readyState === WebSocket.OPEN) || Array.from(set)[0];
            if (another) userSockets.set(ws.userId, another);
          }
        }
        if (onlineUsers.has(ws.userId)) {
          onlineUsers.delete(ws.userId);
          broadcastOnlineUsers();
        }
        
        // Eliminar partidas en "waiting" donde este usuario era player1
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
        
        // Eliminar socket principal solo si ya no quedan conexiones
        const hadSocket = !userSocketSets.has(ws.userId) ? userSockets.delete(ws.userId) : false;
        socketUsers.delete(ws);
        console.log(`   [DBG] userSockets.size=${userSockets.size} (removed=${hadSocket})`);
        
        // Remover de usuarios en línea
        onlineUsers.delete(ws.userId);
        
        // Broadcast lista actualizada
        broadcastOnlineUsers();
        
        // Actualizar stats de admin
        broadcastAdminStats();
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
    // Debug: estado de sockets actuales
    try {
      const socketIds = Array.from(userSockets.keys());
      console.log(`   [DBG] userSockets.size=${userSockets.size} ids=${JSON.stringify(socketIds)}`);
      const mySocket = userSockets.get(userId);
      if (mySocket) {
        console.log(`   [DBG] ${username} readyState=${mySocket.readyState} isAlive=${mySocket.isAlive} isSearching=${!!mySocket.isSearchingMatch}`);
      } else {
        console.log(`   [DBG] ${username} no está en userSockets (inconsistencia)`);
      }
    } catch (e) {
      console.log('   [DBG] Error inspeccionando userSockets:', e);
    }

    // Verificar que el usuario tenga un deck activo
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true }
    });

    if (!activeDeck) {
      return sendEvent(ws, 'error', {
        code: 'NO_ACTIVE_DECK',
        message: 'No tienes un deck activo. Activa uno primero.'
      });
    }

    // Verificar si ya está en una partida REAL (no solo waiting)
    const activeMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { player1_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } },
          { player2_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } }
        ]
      }
    });

    if (activeMatch) {
      console.log(`⚠️ ${username} ya está en una partida activa (fase: ${activeMatch.phase})`);
      return sendEvent(ws, 'error', {
        code: 'ALREADY_IN_MATCH',
        message: 'Ya estás en una partida activa'
      });
    }

    // Si el usuario tenía una partida en "waiting" (solo esperando), eliminarla
    const oldWaitingMatch = await Match.findOne({
      where: {
        player1_id: userId,
        phase: 'waiting'
      }
    });

    if (oldWaitingMatch) {
      console.log(`🧹 Limpiando partida antigua en espera de ${username} (${oldWaitingMatch.id})`);
      await oldWaitingMatch.destroy();
    }

    // Auto-limpieza de partidas antiguas (>10 min) - DESHABILITADO
    // const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    // await Match.destroy({
    //   where: {
    //     phase: 'waiting',
    //     created_at: { [Op.lt]: tenMinutesAgo }
    //   }
    // });

    // Buscar partida en espera (FIFO - más antiguo primero) - SIN LÍMITE DE TIEMPO
    // Buscar TODAS las partidas en waiting y filtrar por socket conectado
    const waitingMatches = await Match.findAll({
      where: { 
        phase: 'waiting',
        player1_id: { [Op.ne]: userId }
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] }
      ],
      order: [['created_at', 'ASC']]
    });

    console.log(`🔍 Búsqueda de partida en espera para ${username}:`);
    console.log(`   - User ID buscando: ${userId}`);
    console.log(`   - Partidas en waiting encontradas: ${waitingMatches.length}`);

    // Filtrar solo las partidas donde el player1 está conectado (con margen de gracia)
    let waitingMatch = null;
    const GRACE_PERIOD_MS = 15000; // 15 segundos de gracia para conexión
    for (const match of waitingMatches) {
      // Verificar si el jugador 1 tiene AL MENOS un socket abierto
      let player1Socket: AuthenticatedWebSocket | undefined = userSockets.get(match.player1_id);
      const socketsSet = userSocketSets.get(match.player1_id);
      if ((!player1Socket || player1Socket.readyState !== WebSocket.OPEN) && socketsSet) {
        player1Socket = Array.from(socketsSet).find(s => s.readyState === WebSocket.OPEN);
      }
      const player1Data = match.get('player1') as any;
      const matchAge = Date.now() - new Date(match.created_at || Date.now()).getTime();
      console.log(`   [DBG] check waiting match ${match.id} of ${player1Data?.username} socket=${!!player1Socket} readyState=${player1Socket?.readyState} isAlive=${player1Socket?.isAlive}`);
      
      // Verificar que el socket exista Y esté en estado OPEN
      if (player1Socket && player1Socket.readyState === WebSocket.OPEN) {
        console.log(`   ✅ Partida válida encontrada: ${player1Data.username} está conectado`);
        waitingMatch = match;
        break;
      } else if (matchAge < GRACE_PERIOD_MS) {
        console.log(`   ⏳ Partida de ${player1Data.username} reciente (${Math.floor(matchAge/1000)}s), esperando...`);
        // No eliminar aún, dar tiempo a que se reconecte
        continue;
      } else {
        console.log(`   ⏭️ Saltando partida de ${player1Data.username} (desconectado, edad: ${Math.floor(matchAge/1000)}s)`);
        // Eliminar partida huérfana (player1 no conectado o socket cerrado)
        await match.destroy();
        console.log(`   🧹 Partida huérfana eliminada: ${match.id}`);
      }
    }

    console.log(`   - Partida VÁLIDA encontrada: ${waitingMatch ? 'SÍ ✅' : 'NO ❌'}`);

    if (waitingMatch) {
      // ¡MATCH ENCONTRADO CON JUGADOR CONECTADO!
      const player1Id = waitingMatch.player1_id;
      const player1Data = waitingMatch.get('player1') as any;
      const player1Socket = userSockets.get(player1Id)!; // Ya verificamos que existe
      
      console.log(`🎮 ¡MATCH ENCONTRADO!`);
      console.log(`   - Player 1: ${player1Data.username} (${player1Id}) ✅ CONECTADO`);
      console.log(`   - Player 2: ${username} (${userId}) ✅ CONECTADO`);
      console.log(`   - Match ID: ${waitingMatch.id}`);
      
      // Actualizar partida
      waitingMatch.player2_id = userId;
      waitingMatch.player2_deck_id = activeDeck.id;
      waitingMatch.phase = 'starting';
      await waitingMatch.save();

      console.log(`✅ Partida actualizada a fase 'starting'`);
      
      // Inicializar cartas en juego
      await initializeMatchCards(waitingMatch, waitingMatch.player1_deck_id, activeDeck.id);
      const cardsInPlay = await CardInPlay.findAll({
        where: { match_id: waitingMatch.id },
        include: [
          {
            model: Card,
            as: 'card',
            attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description', 'faction', 'element'],
            include: [
              {
                model: (await import('../models/CardKnight')).default,
                as: 'card_knight',
                attributes: ['attack', 'defense', 'health', 'cosmos', 'can_defend', 'defense_reduction'],
                required: false
              }
            ]
          }
        ]
      });
      const cardsData = cardsInPlay.map(serializeCardInPlay);
      waitingMatch.phase = 'player1_turn';
      awardBluePoint(waitingMatch, 1);
      await waitingMatch.save();

      // Calcular contadores de mano y mazo
      const player1HandCount = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'hand').length;
      const player2HandCount = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'hand').length;
      const player1DeckSize = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'deck').length;
      const player2DeckSize = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'deck').length;

      const matchData = {
        match_id: waitingMatch.id,
        player1: {
          id: waitingMatch.player1_id,
          username: player1Data?.username
        },
        player2: {
          id: userId,
          username: username
        },
        phase: waitingMatch.phase,
        current_turn: waitingMatch.current_turn,
        current_player: waitingMatch.current_player,
        player1_cosmos: waitingMatch.player1_cosmos,
        player2_cosmos: waitingMatch.player2_cosmos,
        player1_hand_count: player1HandCount,
        player2_hand_count: player2HandCount,
        player1_deck_size: player1DeckSize,
        player2_deck_size: player2DeckSize,
        cards_in_play: cardsData
      };

      console.log(`📤 Enviando match_found a ${username}...`);
      sendEvent(ws, 'match_found', matchData);

      console.log(`📤 Enviando match_found a ${player1Data.username}...`);
      sendEvent(player1Socket, 'match_found', matchData);
      
      // Actualizar stats de admin
      broadcastAdminStats();

    } else {
      // No hay partidas esperando - crear nueva
      console.log(`📝 No hay partidas en espera. Creando nueva partida para ${username}...`);
      const newMatch = await Match.create({
        player1_id: userId,
        player1_deck_id: activeDeck.id,
        player2_id: null as any,
        player2_deck_id: null as any,
        phase: 'waiting',
        player1_life: 12,
        player2_life: 12,
        player1_cosmos: 0,
        player2_cosmos: 0,
        current_turn: 1,
        current_player: 1
      });

      console.log(`⏳ ${username} esperando rival... (Match ID: ${newMatch.id})`);

      sendEvent(ws, 'searching', {
        message: 'Buscando rival...',
        match_id: newMatch.id
      });
      
      console.log(`📤 Evento 'searching' enviado a ${username}`);
      
      // Actualizar stats de admin
      broadcastAdminStats();
    }

  } catch (error: any) {
    console.error('Error en search_match:', error);
    sendEvent(ws, 'error', {
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
      
      sendEvent(ws, 'search_cancelled', {
        success: true,
        message: 'Búsqueda cancelada'
      });
      
      // Actualizar stats de admin
      broadcastAdminStats();
    } else {
      console.log(`⚠️ ${username} no tiene partida en espera para cancelar`);
      sendEvent(ws, 'search_cancelled', {
        success: false,
        message: 'No hay búsqueda activa'
      });
    }
  } catch (error) {
    console.error('Error cancelando búsqueda:', error);
    sendEvent(ws, 'error', {
      code: 'CANCEL_ERROR',
      message: 'Error al cancelar búsqueda'
    });
  }
}

async function handleCheckCanSearch(ws: AuthenticatedWebSocket) {
  try {
    const userId = ws.userId!;
    const username = ws.username!;

    console.log(`🔍 ${username} verifica si puede buscar partida...`);

    // Verificar si ya está en una partida activa
    const existingMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { player1_id: userId, phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] } },
          { player2_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } }
        ]
      }
    });

    if (existingMatch && existingMatch.phase !== 'waiting') {
      return sendEvent(ws, 'deck_check_result', {
        can_search: false,
        reason: 'ALREADY_IN_MATCH',
        message: 'Ya estás en una partida activa',
        match: {
          id: existingMatch.id,
          phase: existingMatch.phase
        }
      });
    }

    // Obtener el deck activo del usuario
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] }
        }
      ]
    });

    if (!activeDeck) {
      return sendEvent(ws, 'deck_check_result', {
        can_search: false,
        reason: 'NO_ACTIVE_DECK',
        message: 'No tienes un mazo marcado como activo',
        deck: null
      });
    }

    // Validar el deck
    const { validateExistingDeck } = await import('../utils/deckValidator');
    const validation = await validateExistingDeck(activeDeck.id);

    if (!validation.valid) {
      return sendEvent(ws, 'deck_check_result', {
        can_search: false,
        reason: 'INVALID_DECK',
        message: 'Tu mazo activo no cumple con las reglas',
        deck: {
          id: activeDeck.id,
          name: activeDeck.name
        },
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    // Todo está OK
    const totalCards = (activeDeck as any).cards?.reduce((sum: number, card: any) => {
      return sum + (card.DeckCard?.quantity || 0);
    }, 0) || 0;

    sendEvent(ws, 'deck_check_result', {
      can_search: true,
      reason: 'OK',
      message: 'Listo para buscar partida',
      deck: {
        id: activeDeck.id,
        name: activeDeck.name,
        total_cards: totalCards
      },
      warnings: validation.warnings
    });

    console.log(`✅ ${username} puede buscar partida (deck: ${activeDeck.name})`);

  } catch (error: any) {
    console.error('Error verificando deck:', error);
    sendEvent(ws, 'deck_check_result', {
      can_search: false,
      reason: 'SERVER_ERROR',
      message: 'Error verificando el mazo'
    });
  }
}

async function handlePlayCard(ws: AuthenticatedWebSocket, data: any) {
  try {
    console.log(`🃏 ${ws.username} juega carta ${data.card_id}`);
    const { match_id, card_id, zone, position } = data;

    if (!match_id || !card_id) {
      sendEvent(ws, 'error', {
        code: 'INVALID_CARD_PLAY',
        message: 'Datos de carta inválidos'
      });
      return;
    }

    const match = await Match.findByPk(match_id, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (!match) {
      sendEvent(ws, 'error', {
        code: 'MATCH_NOT_FOUND',
        message: 'Partida no encontrada'
      });
      return;
    }

    const playerNumber = match.player1_id === ws.userId ? 1 : match.player2_id === ws.userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', {
        code: 'NOT_IN_MATCH',
        message: 'No perteneces a esta partida'
      });
      return;
    }

    const card = await Card.findByPk(card_id);
    if (!card) {
      sendEvent(ws, 'error', {
        code: 'CARD_NOT_FOUND',
        message: 'Carta no encontrada'
      });
      return;
    }

    const availableCosmos = playerNumber === 1 ? match.player1_cosmos : match.player2_cosmos;

    if (card.cost > availableCosmos) {
      sendEvent(ws, 'error', {
        code: 'INSUFFICIENT_COSMOS',
        message: 'No tienes suficiente cosmo para jugar esa carta'
      });
      return;
    }

    if (playerNumber === 1) {
      match.player1_cosmos = availableCosmos - card.cost;
    } else {
      match.player2_cosmos = availableCosmos - card.cost;
    }

    await match.save();

    const cardInPlay = await CardInPlay.findOne({
      where: {
        match_id,
        card_id,
        player_number: playerNumber,
        zone: 'hand'
      }
    });

    if (!cardInPlay) {
      sendEvent(ws, 'error', {
        code: 'CARD_NOT_IN_HAND',
        message: 'La carta ya no está en tu mano'
      });
      return;
    }

    cardInPlay.zone = zone;
    cardInPlay.position = typeof position === 'number' ? position : cardInPlay.position;
    await cardInPlay.save();

    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id },
      include: [
        {
          model: Card,
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description']
        }
      ]
    });

    const cardsData = cardsInPlay.map(serializeCardInPlay);

    const matchState = {
      id: match.id,
      player1_id: match.player1_id,
      player1_name: (match.get('player1') as any)?.username,
      player2_id: match.player2_id,
      player2_name: (match.get('player2') as any)?.username,
      current_turn: match.current_turn,
      current_player: match.current_player,
      phase: match.phase,
      player1_life: match.player1_life,
      player2_life: match.player2_life,
      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,
      cards_in_play: cardsData
    };

    sendEvent(ws, 'card_played', {
      match: matchState,
      card_id,
      zone,
      position
    });

    if (match.player1_id && userSockets.has(match.player1_id)) {
      sendEvent(userSockets.get(match.player1_id)!, 'match_update', matchState);
    }
    if (match.player2_id && userSockets.has(match.player2_id)) {
      sendEvent(userSockets.get(match.player2_id)!, 'match_update', matchState);
    }

    console.log(`   💥 Carta ${card.name} jugada por Jugador ${playerNumber}. Cosmos gastado: ${card.cost}`);
  } catch (error) {
    console.error('Error en play_card:', error);
  }
}

async function handleDeclareAttack(ws: AuthenticatedWebSocket, data: any) {
  try {
    console.log(`⚔️ ${ws.username} declara ataque`);
    const { match_id, attacker_id, defender_id } = data;

    if (!match_id || !attacker_id || !defender_id) {
      sendEvent(ws, 'error', {
        code: 'INVALID_ATTACK',
        message: 'Datos de ataque incompletos'
      });
      return;
    }

    const match = await Match.findByPk(match_id, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (!match) {
      sendEvent(ws, 'error', {
        code: 'MATCH_NOT_FOUND',
        message: 'Partida no encontrada'
      });
      return;
    }

    const playerNumber = match.player1_id === ws.userId ? 1 : match.player2_id === ws.userId ? 2 : null;

    if (!playerNumber || playerNumber !== match.current_player) {
      sendEvent(ws, 'error', {
        code: 'NOT_YOUR_TURN',
        message: 'No es tu turno'
      });
      return;
    }

    // Obtener cartas atacante y defensor
    const attacker = await CardInPlay.findByPk(attacker_id);
    const defender = await CardInPlay.findByPk(defender_id);

    if (!attacker || !defender) {
      sendEvent(ws, 'error', {
        code: 'CARD_NOT_FOUND',
        message: 'Una de las cartas no existe'
      });
      return;
    }

    // Validaciones básicas
    if (attacker.player_number !== playerNumber) {
      sendEvent(ws, 'error', {
        code: 'NOT_YOUR_CARD',
        message: 'Esa carta no es tuya'
      });
      return;
    }

    if ((attacker as any).has_attacked_this_turn) {
      sendEvent(ws, 'error', {
        code: 'ALREADY_ATTACKED',
        message: 'Esa carta ya atacó este turno'
      });
      return;
    }

    // Calcular daño
    const attackerAttack = attacker.current_attack || 0;
    const defenderDefense = defender.current_defense || 0;
    const damage = Math.max(1, attackerAttack - defenderDefense);

    console.log(`   ⚔️ Ataque: ${damage} daño (ATK:${attackerAttack} - DEF:${defenderDefense})`);

    // Aplicar daño
    defender.current_health = (defender.current_health || 0) - damage;
    (attacker as any).has_attacked_this_turn = true;

    // Si la defensa muere
    if (defender.current_health <= 0) {
      console.log(`   ☠️ Defensor eliminado`);
      defender.zone = 'yomotsu';
    }

    await attacker.save();
    await defender.save();

    // Broadcast update a ambos jugadores
    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id },
      include: [
        {
          model: Card,
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'image_url', 'description']
        }
      ]
    });

    const cardsData = cardsInPlay.map(serializeCardInPlay);

    const matchState = {
      id: match.id,
      player1_id: match.player1_id,
      player1_name: (match.get('player1') as any)?.username,
      player2_id: match.player2_id,
      player2_name: (match.get('player2') as any)?.username,
      current_turn: match.current_turn,
      current_player: match.current_player,
      phase: match.phase,
      player1_life: match.player1_life,
      player2_life: match.player2_life,
      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,
      cards_in_play: cardsData
    };

    if (match.player1_id && userSockets.has(match.player1_id)) {
      sendEvent(userSockets.get(match.player1_id)!, 'match_update', matchState);
    }
    if (match.player2_id && userSockets.has(match.player2_id)) {
      sendEvent(userSockets.get(match.player2_id)!, 'match_update', matchState);
    }

    console.log(`   📡 Ataque broadcast a ambos jugadores`);

  } catch (error) {
    console.error('Error en declare_attack:', error);
  }
}

async function handleEndTurn(ws: AuthenticatedWebSocket, data: any) {
  try {
    console.log(`⏭️ ${ws.username} termina turno`);
    
    const { match_id } = data;
    if (!match_id) {
      console.error('❌ match_id no proporcionado');
      return;
    }

    // Obtener la partida
    let match = await Match.findByPk(match_id, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (!match) {
      console.error('❌ Partida no encontrada:', match_id);
      return;
    }

    // 1. Cambiar turno
    const nextPlayer = match.current_player === 1 ? 2 : 1;
    const nextTurn = match.current_player === 1 ? match.current_turn : match.current_turn + 1;
    
    match.current_player = nextPlayer;
    match.current_turn = nextTurn;
    match.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';
    awardBluePoint(match, nextPlayer);
    
    console.log(`   🔄 Turno ${nextTurn}, ahora juega Jugador ${nextPlayer}`);

    // 2. Dibujar 1 carta para el nuevo jugador
    const deckOrderKey = nextPlayer === 1 ? 'player1_deck_order' : 'player2_deck_order';
    const deckIndexKey = nextPlayer === 1 ? 'player1_deck_index' : 'player2_deck_index';
    
    const deckOrder = JSON.parse((match as any)[deckOrderKey] || '[]');
    let deckIndex = (match as any)[deckIndexKey] || 7;
    
    let drawnCard = null;
    if (deckIndex < deckOrder.length) {
      const drawnCardId = deckOrder[deckIndex];
      console.log(`   🎴 Dibujando carta ${drawnCardId} (índice ${deckIndex})`);
      
      // Obtener la carta del deck y ponerla en mano
      const deckCard = await CardInPlay.findOne({
        where: {
          match_id,
          card_id: drawnCardId,
          player_number: nextPlayer,
          zone: 'deck'
        }
      });
      
      if (deckCard) {
        // Actualizar zona a mano
        deckCard.zone = 'hand';
        await deckCard.save();
        drawnCard = deckCard;
        console.log(`   ✅ Carta movida a mano`);
      }
      
      deckIndex++;
      (match as any)[deckIndexKey] = deckIndex;
    } else {
      console.log(`   ⚠️ No hay más cartas en el deck (mazo vacío)`);
    }
    
    await match.save();

    // 3. Cargar todas las cartas en juego
    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id },
      include: [
        { 
          model: Card, 
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description']
        }
      ]
    });

    console.log(`📋 Cartas en juego: ${cardsInPlay.length}`);

    // Serializar cartas para el cliente
    const cardsData = cardsInPlay.map(cardInPlay => ({
      id: cardInPlay.id,
      card_id: cardInPlay.card_id,
      player_number: cardInPlay.player_number,
      zone: cardInPlay.zone,
      position: cardInPlay.position,
      is_defensive_mode: cardInPlay.is_defensive_mode,
      current_attack: cardInPlay.current_attack,
      current_defense: cardInPlay.current_defense,
      current_health: cardInPlay.current_health,
      current_cosmos: cardInPlay.current_cosmos,
      can_attack_this_turn: cardInPlay.can_attack_this_turn,
      has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
      card: {
        id: (cardInPlay.get('card') as any)?.id,
        name: (cardInPlay.get('card') as any)?.name,
        type: (cardInPlay.get('card') as any)?.type,
        rarity: (cardInPlay.get('card') as any)?.rarity,
        cost: (cardInPlay.get('card') as any)?.cost,
        generate: (cardInPlay.get('card') as any)?.generate,
        image_url: (cardInPlay.get('card') as any)?.image_url,
        description: (cardInPlay.get('card') as any)?.description
      }
    }));

    // Calcular contadores de mano y mazo
    const player1HandCount = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'hand').length;
    const player2HandCount = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'hand').length;
    const player1DeckSize = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'deck').length;
    const player2DeckSize = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'deck').length;

    // Construir estado completo para enviar
    const matchState = {
      id: match.id,
      player1_id: match.player1_id,
      player1_name: (match.get('player1') as any)?.username,
      player2_id: match.player2_id,
      player2_name: (match.get('player2') as any)?.username,
      current_turn: match.current_turn,
      current_player: match.current_player,
      phase: match.phase,
      player1_life: match.player1_life,
      player2_life: match.player2_life,
      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,
      player1_hand_count: player1HandCount,
      player2_hand_count: player2HandCount,
      player1_deck_size: player1DeckSize,
      player2_deck_size: player2DeckSize,
      cards_in_play: cardsData,
      drawn_card: drawnCard ? {
        id: drawnCard.id,
        card_id: drawnCard.card_id
      } : null
    };

    console.log('📤 Enviando estado actualizado de partida...');
    
    // Enviar a ambos jugadores
    if (userSockets.has(match.player1_id)) {
      sendEvent(userSockets.get(match.player1_id)!, 'turn_changed', matchState);
    }
    if (match.player2_id && userSockets.has(match.player2_id)) {
      sendEvent(userSockets.get(match.player2_id)!, 'turn_changed', matchState);
    }
  } catch (error) {
    console.error('Error en end_turn:', error);
  }
}

// =====================================
// HANDLERS DE ADMIN
// =====================================

async function handleAdminDisconnectUser(data: any) {
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
    broadcastAdminStats();
  } catch (error) {
    console.error('Error desconectando usuario:', error);
  }
}

async function handleAdminBlockUser(data: any) {
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
    broadcastAdminStats();
  } catch (error) {
    console.error('Error bloqueando usuario:', error);
  }
}

// ==================== CHAT HANDLERS ====================

async function handleChatMessage(ws: WebSocket, data: any) {
  try {
    const { message, message_type = 'global', target_user_id } = data;
    
    if (!message || message.trim() === '') {
      sendEvent(ws, 'chat_error', { error: 'Mensaje vacío' });
      return;
    }

    const userId = (ws as any).userId;
    const username = (ws as any).username;

    // Guardar mensaje en la base de datos
    const chatMessage = await ChatMessage.create({
      user_id: userId,
      username: username,
      message: message.trim(),
      message_type: message_type,
      target_user_id: message_type === 'whisper' ? target_user_id : null
    });

    // Preparar mensaje para broadcast
    const messageData = {
      id: chatMessage.id,
      user_id: userId,
      username: username,
      message: chatMessage.message,
      message_type: chatMessage.message_type,
      target_user_id: chatMessage.target_user_id,
      created_at: chatMessage.created_at
    };

    // Broadcast según tipo de mensaje
    if (message_type === 'whisper' && target_user_id) {
      // Enviar solo al destinatario y al remitente
      const targetWs = userSockets.get(target_user_id);
      if (targetWs) {
        sendEvent(targetWs, 'chat_message', messageData);
      }
      sendEvent(ws, 'chat_message', messageData); // Confirmar al remitente
    } else {
      // Broadcast global a todos los usuarios conectados
      userSockets.forEach((userWs) => {
        sendEvent(userWs, 'chat_message', messageData);
      });
    }

    console.log(`💬 Chat [${message_type}] ${username}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
  } catch (error) {
    console.error('Error manejando mensaje de chat:', error);
    sendEvent(ws, 'chat_error', { error: 'Error al enviar mensaje' });
  }
}

async function handleUpdateStatus(ws: WebSocket, data: any) {
  try {
    const { status } = data;
    const userId = (ws as any).userId;
    
    if (!['online', 'in_match', 'away'].includes(status)) {
      sendEvent(ws, 'error', { error: 'Estado inválido' });
      return;
    }

    const userInfo = onlineUsers.get(userId);
    if (userInfo) {
      userInfo.status = status;
      broadcastOnlineUsers();
      console.log(`👤 ${userInfo.username} cambió estado a: ${status}`);
    }
  } catch (error) {
    console.error('Error actualizando estado de usuario:', error);
  }
}

function sendOnlineUsersList(ws: WebSocket) {
  const users = Array.from(onlineUsers.values()).map(u => ({
    user_id: u.userId,
    username: u.username,
    avatar_url: u.avatarUrl || '/assets/avatars/avatar_1.png',
    status: u.status,
    connected_at: u.connectedAt.toISOString()
  }));
  sendEvent(ws, 'online_users', { users });
}

function broadcastOnlineUsers() {
  const users = Array.from(onlineUsers.values()).map(u => ({
    user_id: u.userId,
    username: u.username,
    avatar_url: u.avatarUrl || '/assets/avatars/avatar_1.png',
    status: u.status,
    connected_at: u.connectedAt.toISOString()
  }));
  userSockets.forEach((ws) => {
    sendEvent(ws, 'online_users', { users });
  });
  console.log(`📡 Broadcast: ${users.length} usuarios en línea`);
}

/**
 * Broadcast de actualización de partida a ambos jugadores
 */
export async function broadcastMatchUpdate(matchId: string) {
  try {
    const match = await Match.findByPk(matchId, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (!match) {
      console.error('❌ Match no encontrado para broadcast:', matchId);
      return;
    }

    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id: matchId },
      include: [
        {
          model: Card,
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description']
        }
      ]
    });

    const cardsData = cardsInPlay.map(serializeCardInPlay);

    // Calcular contadores de mano y mazo
    const player1HandCount = cardsInPlay.filter((c: any) => c.player_number === 1 && c.zone === 'hand').length;
    const player2HandCount = cardsInPlay.filter((c: any) => c.player_number === 2 && c.zone === 'hand').length;
    const player1DeckSize = cardsInPlay.filter((c: any) => c.player_number === 1 && c.zone === 'deck').length;
    const player2DeckSize = cardsInPlay.filter((c: any) => c.player_number === 2 && c.zone === 'deck').length;

    const matchState = {
      id: match.id,
      player1_id: match.player1_id,
      player1_name: (match.get('player1') as any)?.username,
      player2_id: match.player2_id,
      player2_name: (match.get('player2') as any)?.username,
      current_turn: match.current_turn,
      current_player: match.current_player,
      phase: match.phase,
      player1_life: match.player1_life,
      player2_life: match.player2_life,
      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,
      player1_hand_count: player1HandCount,
      player2_hand_count: player2HandCount,
      player1_deck_size: player1DeckSize,
      player2_deck_size: player2DeckSize,
      cards_in_play: cardsData
    };

    if (match.player1_id && userSockets.has(match.player1_id)) {
      sendEvent(userSockets.get(match.player1_id)!, 'match_update', matchState);
    }
    if (match.player2_id && userSockets.has(match.player2_id)) {
      sendEvent(userSockets.get(match.player2_id)!, 'match_update', matchState);
    }

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

    // 1. Obtener mazo activo del usuario
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true }
    });

    if (!activeDeck) {
      sendEvent(ws, 'match_error', { 
        message: 'No tienes un mazo activo. Marca un mazo como activo primero.',
        code: 'NO_ACTIVE_DECK'
      });
      console.log('❌ Usuario sin mazo activo');
      return;
    }

    // 2. Validar mazo
    const user = await User.findByPk(userId);
    if (!user) {
      sendEvent(ws, 'match_error', { message: 'Usuario no encontrado' });
      return;
    }

    // 3. Crear partida TEST
    const testMatch = await Match.create({
      player1_id: userId,
      player2_id: userId,  // El mismo usuario vs sí mismo
      player1_deck_id: activeDeck.id,
      player2_deck_id: activeDeck.id,  // Mismo mazo
      phase: 'starting',
      current_turn: 1,
      current_player: 1,
      player1_life: 12,
      player2_life: 12,
      player1_cosmos: 0,
      player2_cosmos: 0,
      started_at: new Date()
    });

    console.log(`✅ TEST Match creada: ${testMatch.id}`);

    // 4. Inicializar cartas (barajar, robar)
    // Obtener cartas del mazo
    const deckCards = await DeckCard.findAll({ where: { deck_id: activeDeck.id } });

    // Expandir por cantidad
    const expandedCardIds: string[] = [];
    for (const dc of deckCards) {
      const qty = (dc as any).quantity || 1;
      for (let i = 0; i < qty; i++) {
        expandedCardIds.push((dc as any).card_id);
      }
    }

    console.log(`📋 Mazo expandido: ${expandedCardIds.length} cartas`);

    // Shuffle (Fisher-Yates)
    const shuffledCards = [...expandedCardIds];
    for (let i = shuffledCards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledCards[i], shuffledCards[j]] = [shuffledCards[j], shuffledCards[i]];
    }

    // Guardar orden barajado en Match
    (testMatch as any).player1_deck_order = JSON.stringify(shuffledCards);
    (testMatch as any).player2_deck_order = JSON.stringify(shuffledCards);
    (testMatch as any).player1_deck_index = 7;
    (testMatch as any).player2_deck_index = 7;
    await testMatch.save();

    console.log(`🔀 Mazos barajeados (7 cartas robadas)`);

    // 5. Crear cartas en juego
    const cardsInPlayData: any[] = [];

    // Jugador 1: 7 cartas en mano, resto en deck
    for (let i = 0; i < shuffledCards.length; i++) {
      const zone = i < 7 ? 'hand' : 'deck';
      const position = i < 7 ? i : i - 7;
      
      cardsInPlayData.push({
        match_id: testMatch.id,
        card_id: shuffledCards[i],
        player_number: 1,
        zone,
        position,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }

    // Jugador 2: 7 cartas en mano, resto en deck (mismo orden shuffled)
    for (let i = 0; i < shuffledCards.length; i++) {
      const zone = i < 7 ? 'hand' : 'deck';
      const position = i < 7 ? i : i - 7;
      
      cardsInPlayData.push({
        match_id: testMatch.id,
        card_id: shuffledCards[i],
        player_number: 2,
        zone,
        position,
        is_defensive_mode: false,
        current_attack: 0,
        current_defense: 0,
        current_health: 0,
        current_cosmos: 0,
        attached_cards: '[]',
        status_effects: '[]',
        can_attack_this_turn: true,
        has_attacked_this_turn: false
      });
    }

    await CardInPlay.bulkCreate(cardsInPlayData);
    console.log(`✅ ${cardsInPlayData.length} cartas en juego creadas`);

    // 6. Cargar cartas con info completa
    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id: testMatch.id },
      include: [
        {
          model: Card,
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'image_url', 'description']
        }
      ]
    });

    // 7. Serializar para el cliente
    const cardsData = cardsInPlay.map((cip: any) => ({
      id: cip.id,
      card_id: cip.card_id,
      instance_id: cip.id,
      player_number: cip.player_number,
      zone: cip.zone,
      position: cip.position,
      mode: cip.is_defensive_mode ? 'defense' : 'normal',
      is_exhausted: cip.has_attacked_this_turn,
      base_data: {
        id: cip.card.id,
        name: cip.card.name,
        type: cip.card.type,
        rarity: cip.card.rarity,
        cost: cip.card.cost,
        image_url: cip.card.image_url,
        description: cip.card.description
      }
    }));

    // 8. Construir GameState para enviar al cliente
    const gameState = {
      id: testMatch.id,
      match_id: testMatch.id,
      current_turn: testMatch.current_turn,
      current_player: testMatch.current_player,
      current_phase: 'main',
      player_number: 1,  // El cliente siempre es player 1 en TEST
      player1_id: testMatch.player1_id,
      player2_id: testMatch.player2_id,
      player1_name: user.username,
      player2_name: user.username,
      player1_life: testMatch.player1_life,
      player2_life: testMatch.player2_life,
      player1_cosmos: testMatch.player1_cosmos,
      player2_cosmos: testMatch.player2_cosmos,
      player1_hand_count: 7,
      player2_hand_count: 7,
      player1_deck_size: shuffledCards.length - 7,
      player2_deck_size: shuffledCards.length - 7,
      cards_in_play: cardsData
    };

    // 9. Enviar match_found event al cliente
    console.log(`📡 Preparando enviar match_found a ${ws.username}...`);
    console.log(`   WebSocket readyState: ${ws.readyState}, WebSocket.OPEN: ${WebSocket.OPEN}`);
    console.log(`   gameState: ${JSON.stringify(gameState).substring(0, 100)}...`);
    sendEvent(ws, 'match_found', gameState);
    console.log(`📡 match_found enviada a ${ws.username}`);

  } catch (error: any) {
    console.error('❌ Error en handleRequestTestMatch:', error);
    sendEvent(ws, 'match_error', { 
      message: 'Error creando partida TEST',
      error: error.message 
    });
  }
}
