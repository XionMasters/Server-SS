/**
 * SearchMatchService.ts
 * 
 * Responsabilidad ÚNICA: Buscar rival disponible
 * 
 * ✅ Valida que usuario tenga deck activo
 * ✅ Valida que usuario pueda buscar (sin partida activa)
 * ✅ Busca rival en la cola (FIFO)
 * ✅ Valida que rival está conectado
 * 
 * ❌ NO crea partida (eso es StartMatchService)
 * ❌ NO inicializa cartas (eso es MatchSetupService)
 * ❌ NO hace orquestación (eso es MatchesCoordinator)
 * 
 * Future: Fácil cambiar a búsqueda por ranking, ELO, etc.
 */

import Match from '../../models/Match';
import User from '../../models/User';
import { Op } from 'sequelize';

export class SearchMatchService {
  /**
   * Busca rival disponible en la cola de espera
   * 
   * Retorna el match en espera si encuentra rival conectado
   * ❌ Retorna null si no hay rival disponible
   * 
   * @param userId Usuario que busca rival
   * @param userSockets Map de sockets conectados (para validar que rival esté online)
   * @param userSocketSets Map adicional de sockets por usuario
   */
  static async findAvailableMatch(
    userId: string,
    userSockets?: Map<string, any>,
    userSocketSets?: Map<string, Set<any>>
  ): Promise<Match | null> {
    try {
      // 1️⃣ Validar que usuario NO tenga partida activa real
      const activeMatch = await Match.findOne({
        where: {
          [Op.or]: [
            { player1_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } },
            { player2_id: userId, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } }
          ]
        }
      });

      if (activeMatch) {
        throw new Error('Ya estás en una partida activa');
      }

      // 2️⃣ Limpiar partidas antiguas en espera de ESTE usuario (si existen)
      const oldWaitingMatch = await Match.findOne({
        where: {
          player1_id: userId,
          phase: 'waiting'
        }
      });

      if (oldWaitingMatch) {
        console.log(`🧹 Limpiando partida antigua en espera: ${oldWaitingMatch.id}`);
        await oldWaitingMatch.destroy();
      }

      // 3️⃣ Buscar partidas en espera (FIFO - más antiguo primero)
      const waitingMatches = await Match.findAll({
        where: {
          phase: 'waiting',
          player1_id: { [Op.ne]: userId } // No me encuentro a mí mismo
        },
        include: [
          { model: User, as: 'player1', attributes: ['id', 'username'] }
        ],
        order: [['created_at', 'ASC']] // FIFO: más antiguo primero
      });

      console.log(`🔍 Búsqueda FIFO: ${waitingMatches.length} partidas en espera`);

      // 4️⃣ Buscar partida válida (player1 debe estar conectado)
      for (const match of waitingMatches) {
        const player1Connected = this._isPlayerConnected(
          match.player1_id,
          userSockets,
          userSocketSets
        );

        if (player1Connected) {
          console.log(`✅ Rival encontrado: ${match.player1_id} en partida ${match.id}`);
          return match;
        } else {
          console.log(`❌ Rival desconectado: ${match.player1_id} en partida ${match.id} → eliminando`);
          // Limpiar partidas con rivales desconectados
          await match.destroy();
        }
      }

      console.log(`⏳ No hay rivales disponibles, usuario debe esperar en cola`);
      return null;

    } catch (error: any) {
      console.error('❌ Error en searchMatch:', error);
      throw error;
    }
  }

  /**
   * HELPER: Valida si un jugador está conectado
   * (chequea userSockets y userSocketSets maps)
   */
  private static _isPlayerConnected(
    userId: string,
    userSockets?: Map<string, any>,
    userSocketSets?: Map<string, Set<any>>
  ): boolean {
    if (!userSockets && !userSocketSets) {
      // Si no tenemos info de conexiones, asumir que está conectado
      return true;
    }

    // Buscar en userSockets (socket primario)
    let playerSocket = userSockets?.get(userId);
    if (playerSocket && playerSocket.readyState === 1) {
      // readyState 1 = OPEN
      return true;
    }

    // Buscar en userSocketSets (sockets adicionales)
    const socketsSet = userSocketSets?.get(userId);
    if (socketsSet) {
      const socketsArray = Array.from(socketsSet);
      for (const socket of socketsArray) {
        if ((socket as any).readyState === 1) {
          return true;
        }
      }
    }

    return false;
  }
}
