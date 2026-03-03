// src/controllers/matches.controller.ts
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Match from '../models/Match';
import Deck from '../models/Deck';
import User from '../models/User';
import { validateExistingDeck } from '../utils/deckValidator';
import { StartMatchService } from '../services/match/startMatch.service';
import { matchesCoordinator } from '../services/coordinators/matchesCoordinator';

// Buscar partida (matchmaking simple)
export const findMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Verificar si el usuario ya está en una partida activa
    const activeMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { player1_id: user.id, phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] } },
          { player2_id: user.id, phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } }
        ]
      }
    });

    if (activeMatch) {
      // Si está esperando, devolver la partida existente
      if (activeMatch.phase === 'waiting' && activeMatch.player1_id === user.id) {
        return res.json(activeMatch);
      }
      // Si ya está en partida activa, devolver error
      return res.status(400).json({ 
        error: 'Ya estás en una partida activa',
        code: 'ALREADY_IN_MATCH',
        match_id: activeMatch.id
      });
    }

    // Obtener el deck activo del usuario
    const activeDeck = await Deck.findOne({
      where: { user_id: user.id, is_active: true }
    });

    if (!activeDeck) {
      return res.status(400).json({ 
        error: 'No tienes un mazo activo. Marca un mazo como activo primero.',
        code: 'NO_ACTIVE_DECK'
      });
    }

    // Validar que el deck cumpla con las reglas
    const validation = await validateExistingDeck(activeDeck.id);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Tu mazo activo no cumple con las reglas del juego',
        code: 'INVALID_DECK',
        deck_name: activeDeck.name,
        validation_errors: validation.errors,
        validation_warnings: validation.warnings
      });
    }

    // Buscar partida en espera (que no sea del mismo usuario y creada en los últimos 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Auto-limpieza de partidas muy antiguas antes de buscar
    await cleanupOldWaitingMatches();
    
    const waitingMatch = await Match.findOne({
      where: { 
        phase: 'waiting',
        player1_id: { [Op.ne]: user.id }, // No emparejar con uno mismo
        created_at: { [Op.gte]: fiveMinutesAgo } // Solo partidas recientes
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] }
      ],
      order: [['created_at', 'ASC']] // FIFO - primero en entrar, primero en salir
    });

    if (waitingMatch) {
      // Unirse a partida existente
      waitingMatch.player2_id = user.id;
      waitingMatch.player2_deck_id = activeDeck.id;
      waitingMatch.phase = 'starting';
      waitingMatch.started_at = new Date();
      await waitingMatch.save();

      // Inicializar el juego
      await StartMatchService.createNewMatch(waitingMatch.player1_id, user.id, 'PVP');

      return res.json(waitingMatch);
    } else {
      // Crear nueva partida en espera
      const newMatch = await Match.create({
        player1_id: user.id,
        player2_id: user.id as any, // Temporal (Sequelize no permite null en este campo)
        player1_deck_id: activeDeck.id,
        player2_deck_id: activeDeck.id as any, // Temporal
        phase: 'waiting'
      });

      return res.json(newMatch);
    }
  } catch (error: any) {
    console.error('Error en matchmaking:', error);
    return res.status(500).json({ error: 'Error buscando partida' });
  }
};

// Obtener estado de la partida
export const getMatchState = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const result = await matchesCoordinator.getMatchState(id, user.id);

    if (!result.success) {
      return res.status((result as any).statusCode || 500).json({
        error: result.error || 'Error obteniendo estado de partida',
        code: (result as any).code || 'MATCH_STATE_ERROR'
      });
    }

    return res.json(result.data);
  } catch (error: any) {
    console.error('Error obteniendo estado de partida:', error);
    return res.status(500).json({ error: 'Error obteniendo estado de partida' });
  }
};

// Verificar si el jugador puede buscar partida
export const canSearchMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const result = await matchesCoordinator.canSearchMatch(user.id, user.username);
    return res.json(result.data);

  } catch (error: any) {
    console.error('Error verificando si puede buscar partida:', error);
    return res.status(500).json({ error: 'Error verificando estado del mazo' });
  }
};

// Cancelar búsqueda de partida
export const cancelSearch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Buscar partida en waiting del usuario
    const waitingMatch = await Match.findOne({
      where: {
        player1_id: user.id,
        phase: 'waiting'
      }
    });

    if (!waitingMatch) {
      return res.status(404).json({
        error: 'No estás buscando partida actualmente',
        code: 'NOT_SEARCHING'
      });
    }

    // Eliminar la partida en waiting
    await waitingMatch.destroy();

    return res.json({
      success: true,
      message: 'Búsqueda cancelada'
    });

  } catch (error: any) {
    console.error('Error cancelando búsqueda:', error);
    return res.status(500).json({ error: 'Error cancelando búsqueda' });
  }
};

// Auto-limpieza de partidas zombi (llamar periódicamente o al buscar)
async function cleanupOldWaitingMatches() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  
  const deleted = await Match.destroy({
    where: {
      phase: 'waiting',
      created_at: { [Op.lt]: tenMinutesAgo }
    }
  });
  
  if (deleted > 0) {
    console.log(`🧹 Limpiadas ${deleted} partidas en espera antiguas`);
  }
}

// TEST Match - Jugar contra uno mismo
export const startTestMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const result = await StartMatchService.createNewMatch(user.id, user.id, 'TEST');
    
    return res.json({
      success: true,
      match_id: result.match_id,
      message: 'Partida TEST iniciada',
      game_state: result.game_state
    });

  } catch (error: any) {
    console.error('Error en startTestMatch:', error);
    
    const statusCode = error.message?.includes('rate limit') ? 429 : 400;
    const errorCode = error.message?.includes('rate limit') ? 'RATE_LIMIT_EXCEEDED' : 'TEST_MATCH_ERROR';

    return res.status(statusCode).json({ 
      error: error.message,
      code: errorCode
    });
  }
};

// TEST Match - Reanudar partida existente
export const resumeTestMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const result = await StartMatchService.resumeTestMatch(user.id);

    return res.json({
      success: true,
      match_id: result.match_id,
      message: 'Partida TEST reanudada',
      game_state: result.game_state
    });

  } catch (error: any) {
    console.error('Error en resumeTestMatch:', error);
    
    return res.status(400).json({ 
      error: error.message,
      code: 'RESUME_TEST_MATCH_ERROR'
    });
  }
};


// Abandonar partida
export const abandonMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // match_id

    const result = await matchesCoordinator.abandonMatch(id, user.id);

    if (!result.success) {
      return res.status((result as any).statusCode || 400).json({
        error: result.error || 'Error abandonando partida',
        code: (result as any).code || 'ABANDON_ERROR'
      });
    }

    return res.json({
      success: true,
      message: result.message || 'Partida abandonada correctamente',
      match_id: result.match_id || id,
      winner_id: result.winner_id
    });
  } catch (error: any) {
    console.error('❌ Error abandonando partida:', error.message);
    return res.status(400).json({ 
      error: error.message,
      code: 'ABANDON_ERROR'
    });
  }
};