// src/services/socket.service.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import User from '../models/User';
import Match from '../models/Match';
import Deck from '../models/Deck';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
}

// Mapeo de userId -> socketId para notificaciones directas
const userSockets = new Map<string, string>();

// Mapeo de socketId -> userId para cleanup
const socketUsers = new Map<string, string>();

/**
 * Inicializa el servidor de WebSockets
 */
export const initializeSocketServer = (io: SocketIOServer) => {
  
  // Middleware de autenticación
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Token no proporcionado'));
      }

      const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;
      const jwtSecret = process.env.JWT_SECRET || 'secret-key-change-in-production';
      
      const decoded = jwt.verify(tokenValue, jwtSecret) as any;
      
      // Verificar que el usuario existe
      const user = await User.findByPk(decoded.userId);
      if (!user) {
        return next(new Error('Usuario no encontrado'));
      }

      socket.userId = decoded.userId;
      socket.username = user.username;
      
      next();
    } catch (error) {
      next(new Error('Token inválido'));
    }
  });

  // Conexión establecida
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username!;
    
    console.log(`✅ Usuario conectado: ${username} (${userId}) - Socket: ${socket.id}`);
    
    // Registrar socket del usuario
    userSockets.set(userId, socket.id);
    socketUsers.set(socket.id, userId);

    // =====================================
    // EVENTOS DE MATCHMAKING
    // =====================================

    /**
     * Buscar partida
     */
    socket.on('search_match', async () => {
      try {
        console.log(`🔍 ${username} busca partida...`);

        // Verificar que el usuario tenga un deck activo
        const activeDeck = await Deck.findOne({
          where: { user_id: userId, is_active: true }
        });

        if (!activeDeck) {
          return socket.emit('error', {
            code: 'NO_ACTIVE_DECK',
            message: 'No tienes un deck activo. Activa uno primero.'
          });
        }

        // Verificar que no esté ya en partida
        const activeMatch = await Match.findOne({
          where: {
            [Op.or]: [
              { player1_id: userId, phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] } },
              { player2_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } }
            ]
          }
        });

        if (activeMatch) {
          return socket.emit('error', {
            code: 'ALREADY_IN_MATCH',
            message: 'Ya estás en una partida activa'
          });
        }

        // Auto-limpieza de partidas antiguas (>10 min)
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await Match.destroy({
          where: {
            phase: 'waiting',
            created_at: { [Op.lt]: tenMinutesAgo }
          }
        });

        // Buscar partida en espera (FIFO - más antiguo primero)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const waitingMatch = await Match.findOne({
          where: { 
            phase: 'waiting',
            player1_id: { [Op.ne]: userId }, // No emparejar consigo mismo
            created_at: { [Op.gte]: fiveMinutesAgo }
          },
          include: [
            { model: User, as: 'player1', attributes: ['id', 'username'] }
          ],
          order: [['created_at', 'ASC']]
        });

        if (waitingMatch) {
          // ¡MATCH ENCONTRADO!
          const player1Id = waitingMatch.player1_id;
          const player1Data = waitingMatch.get('player1') as any;
          
          // Actualizar partida
          waitingMatch.player2_id = userId;
          waitingMatch.player2_deck_id = activeDeck.id;
          waitingMatch.phase = 'starting';
          await waitingMatch.save();

          console.log(`✅ Match encontrado: ${player1Data?.username} vs ${username}`);

          // Notificar a AMBOS jugadores
          const player1SocketId = userSockets.get(player1Id);
          
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
            phase: 'starting'
          };

          // Notificar al jugador 2 (el que acaba de unirse)
          socket.emit('match_found', matchData);

          // Notificar al jugador 1 (el que estaba esperando)
          if (player1SocketId) {
            io.to(player1SocketId).emit('match_found', matchData);
          }

        } else {
          // No hay partidas esperando - crear nueva
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

          console.log(`⏳ ${username} esperando rival... (Match ${newMatch.id})`);

          socket.emit('searching', {
            message: 'Buscando rival...',
            match_id: newMatch.id
          });
        }

      } catch (error: any) {
        console.error('Error en search_match:', error);
        socket.emit('error', {
          code: 'SEARCH_ERROR',
          message: 'Error al buscar partida'
        });
      }
    });

    /**
     * Cancelar búsqueda
     */
    socket.on('cancel_search', async () => {
      try {
        const waitingMatch = await Match.findOne({
          where: {
            player1_id: userId,
            phase: 'waiting'
          }
        });

        if (waitingMatch) {
          await waitingMatch.destroy();
          console.log(`❌ ${username} canceló la búsqueda`);
          
          socket.emit('search_cancelled', {
            message: 'Búsqueda cancelada'
          });
        }
      } catch (error) {
        console.error('Error cancelando búsqueda:', error);
      }
    });

    // =====================================
    // EVENTOS DE PARTIDA EN TIEMPO REAL
    // =====================================

    /**
     * Jugar carta
     */
    socket.on('play_card', async (data: { match_id: string, card_id: string, position?: number }) => {
      try {
        // TODO: Implementar lógica de jugar carta
        console.log(`🃏 ${username} juega carta ${data.card_id} en match ${data.match_id}`);
        
        // Emitir a ambos jugadores
        socket.emit('card_played', data);
        // TODO: Emitir al oponente también
      } catch (error) {
        console.error('Error en play_card:', error);
      }
    });

    /**
     * Terminar turno
     */
    socket.on('end_turn', async (data: { match_id: string }) => {
      try {
        // TODO: Implementar lógica de cambio de turno
        console.log(`⏭️ ${username} termina turno en match ${data.match_id}`);
      } catch (error) {
        console.error('Error en end_turn:', error);
      }
    });

    // =====================================
    // DESCONEXIÓN
    // =====================================

    socket.on('disconnect', () => {
      console.log(`❌ Usuario desconectado: ${username} - Socket: ${socket.id}`);
      
      // Limpiar mapeos
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      
      // TODO: Manejar desconexión en partida activa (dar tiempo de reconexión)
    });
  });

  console.log('🔌 Socket.IO server initialized');
};
