// src/controllers/matches.controller.ts
import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';
import MatchAction from '../models/MatchAction';
import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import User from '../models/User';
import { validateExistingDeck } from '../utils/deckValidator';
import { GameService } from '../services/game.service';
import { StartMatchService } from '../services/startMatch.service';

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

    const match = await Match.findOne({
      where: { id },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] },
        { 
          model: CardInPlay, 
          as: 'cards_in_play',
          include: [
            { model: Card, as: 'card', include: [{ model: CardKnight, as: 'card_knight' }] }
          ]
        }
      ]
    });

    if (!match) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    // Verificar que el usuario sea parte de la partida
    if (match.player1_id !== user.id && match.player2_id !== user.id) {
      return res.status(403).json({ error: 'No eres parte de esta partida' });
    }

    return res.json(match);
  } catch (error: any) {
    console.error('Error obteniendo estado de partida:', error);
    return res.status(500).json({ error: 'Error obteniendo estado de partida' });
  }
};

// Jugar carta - ahora delegada a GameService
export const playCard = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // match_id
    const { card_in_play_id, position } = req.body;

    const result = await GameService.playCard(id, user.id, card_in_play_id, position);
    
    return res.json({ 
      message: 'Carta jugada exitosamente', 
      match: result.match, 
      cardInPlay: result.cardInPlay 
    });
  } catch (error: any) {
    console.error('❌ Error jugando carta:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

// Pasar turno - ahora delegada a GameService
export const passTurn = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const result = await GameService.passTurn(id, user.id);
    return res.json(result);
  } catch (error: any) {
    console.error('❌ Error pasando turno:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

// Verificar si el jugador puede buscar partida
export const canSearchMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    // Verificar si ya está en una partida activa o buscando
    const existingMatch = await Match.findOne({
      where: {
        [Op.or]: [
          { 
            player1_id: user.id, 
            phase: { [Op.in]: ['waiting', 'starting', 'player1_turn', 'player2_turn'] } 
          },
          { 
            player2_id: user.id, 
            phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } 
          }
        ]
      },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    if (existingMatch) {
      const isSearching = existingMatch.phase === 'waiting';
      
      // Si está en waiting (solo esperando), permitir buscar de nuevo (se limpiará al buscar)
      if (isSearching) {
        console.log(`ℹ️ Usuario ${user.username} tiene partida en waiting, se limpiará al buscar`);
      } else {
        // Está en partida activa - verificar que el otro jugador esté disponible
        // Si no está, se limpiará al conectarse al WebSocket
        return res.json({
          can_search: false,
          reason: 'ALREADY_IN_MATCH',
          message: 'Ya estás en una partida activa',
          match: {
            id: existingMatch.id,
            phase: existingMatch.phase
          }
        });
      }
    }

    // Obtener el deck activo del usuario
    const activeDeck = await Deck.findOne({
      where: { user_id: user.id, is_active: true },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] }
        }
      ]
    });

    if (!activeDeck) {
      return res.json({
        can_search: false,
        reason: 'NO_ACTIVE_DECK',
        message: 'No tienes un mazo marcado como activo',
        deck: null
      });
    }

    // Validar el deck
    const validation = await validateExistingDeck(activeDeck.id);

    if (!validation.valid) {
      return res.json({
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
    return res.json({
      can_search: true,
      reason: 'OK',
      message: 'Listo para buscar partida',
      deck: {
        id: activeDeck.id,
        name: activeDeck.name,
        total_cards: (activeDeck as any).cards?.reduce((sum: number, card: any) => {
          return sum + (card.DeckCard?.quantity || 0);
        }, 0) || 0
      },
      warnings: validation.warnings
    });

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
    //
    const user = (req as any).user;

    // Delegar toda la lógica al servicio especializado
    const { StartMatchService } = await import('../services/startMatch.service');
    const result = await StartMatchService.createNewMatch(user.id, user.id, 'TEST');

    // Enviar notificación al cliente vía WebSocket (para sincronizar futuros cambios)
    const { broadcastMatchUpdate } = await import('../services/websocket.service');
    await broadcastMatchUpdate(result.match_id);
    
    return res.json({
      success: true,
      match_id: result.match_id,
      message: 'Partida TEST iniciada',
      game_state: result.game_state
    });

  } catch (error: any) {
    console.error('Error en startTestMatch:', error);
    
    // Manejo de errores específicos
    const statusCode = error.message.includes('rate limit') ? 429 : 400;
    const errorCode = error.message.includes('rate limit') ? 'RATE_LIMIT_EXCEEDED' : 'TEST_MATCH_ERROR';

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

    // Delegar toda la lógica al servicio especializado
    const { StartMatchService } = await import('../services/startMatch.service');
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

// Atacar caballero
export const attackKnight = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // match_id
    const { attacker_card_in_play_id, defender_card_in_play_id } = req.body;

    const result = await GameService.attackKnight(
      id,
      user.id,
      attacker_card_in_play_id,
      defender_card_in_play_id
    );

    return res.json(result);
  } catch (error: any) {
    console.error('❌ Error atacando:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

// Cambiar modo defensivo
export const changeDefensiveMode = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // match_id
    const { card_in_play_id, new_mode } = req.body;

    const result = await GameService.changeDefensiveMode(
      id,
      user.id,
      card_in_play_id,
      new_mode
    );

    return res.json({
      success: true,
      message: `Modo cambiado a: ${new_mode}`,
      card: result
    });
  } catch (error: any) {
    console.error('❌ Error cambiando modo:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

export const startFirstTurn = async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;

    const result = await GameService.startFirstTurn(id, user.id);

    // El servicio ya devuelve solo los campos necesarios
    return res.json(result);
  } catch (error: any) {
    console.error('❌ Error iniciando primer turno:', error.message);
    return res.status(400).json({ error: error.message });
  }
};

// Abandonar partida
export const abandonMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // match_id

    // Buscar la partida
    const match = await Match.findByPk(id);
    
    if (!match) {
      return res.status(404).json({ 
        error: 'Partida no encontrada',
        code: 'MATCH_NOT_FOUND'
      });
    }

    // Verificar que el usuario esté en la partida
    if (match.player1_id !== user.id && match.player2_id !== user.id) {
      return res.status(403).json({ 
        error: 'No estás en esta partida',
        code: 'UNAUTHORIZED'
      });
    }

    // Verificar que la partida esté activa
    if (!['starting', 'player1_turn', 'player2_turn'].includes(match.phase)) {
      return res.status(400).json({ 
        error: 'Esta partida ya ha finalizado',
        code: 'MATCH_ALREADY_FINISHED'
      });
    }

    // Determinar ganador (el otro jugador)
    const winner_id = match.player1_id === user.id ? match.player2_id : match.player1_id;

    // Validar que tengamos un ganador válido
    if (!winner_id) {
      return res.status(400).json({ 
        error: 'Error: no se puede determinar el ganador',
        code: 'INVALID_MATCH_STATE'
      });
    }

    // Actualizar partida
    console.log(`⏳ Cambiando fase de partida ${id} a 'finished'...`);
    match.winner_id = winner_id as string;
    match.phase = 'finished';
    match.finished_at = new Date();
    await match.save();

    console.log(`✅ Partida abandonada: ${id}`);
    console.log(`   🏆 Ganador: ${winner_id}`);
    console.log(`   🚪 Abandonado por: ${user.id}`);
    console.log(`   ✔️ Phase guardada como: ${match.phase}`);

    // Pequeño delay para asegurar que la transacción se complete
    // en la base de datos antes de responder al cliente
    await new Promise(resolve => setTimeout(resolve, 500));

    return res.json({
      success: true,
      message: 'Partida abandonada correctamente',
      match_id: id,
      winner_id: winner_id
    });
  } catch (error: any) {
    console.error('❌ Error abandonando partida:', error.message);
    return res.status(400).json({ 
      error: error.message,
      code: 'ABANDON_ERROR'
    });
  }
};