// src/controllers/decks.controller.ts
import { Request, Response } from 'express';
import { DeckService, ServiceError } from '../services/deck.service';

// Obtener todos los decks del usuario
export const getUserDecks = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const decks = await DeckService.getUserDecks(user.id);
    return res.json(decks);
  } catch (error: any) {
    console.error('Error obteniendo decks:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error obteniendo decks del usuario' });
  }
};

// Obtener un deck específico
export const getDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const deck = await DeckService.getDeckByIdForUser(user.id, id);
    return res.json(deck);
  } catch (error: any) {
    console.error('Error obteniendo deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error obteniendo deck' });
  }
};

// Crear un nuevo deck
export const createDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description } = req.body;
    const deck = await DeckService.createDeckForUser(user.id, name, description);
    return res.status(201).json(deck);
  } catch (error: any) {
    console.error('Error creando deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error creando deck' });
  }
};

// Actualizar deck
export const updateDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    const deck = await DeckService.updateDeckForUser(user.id, id, { name, description, is_active });

    return res.json(deck);
  } catch (error: any) {
    console.error('Error actualizando deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error actualizando deck' });
  }
};

// Eliminar deck
export const deleteDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    await DeckService.deleteDeckForUser(user.id, id);

    return res.json({ message: 'Deck eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error eliminando deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error eliminando deck' });
  }
};

// Agregar carta al deck
export const addCardToDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // deck_id
    const { card_id, quantity = 1 } = req.body;

    const result = await DeckService.addCardToDeck(user.id, id, card_id, quantity);
    return res.status(result.created ? 201 : 200).json(result.deckCard);
  } catch (error: any) {
    console.error('Error agregando carta al deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error agregando carta al deck' });
  }
};

// Remover carta del deck
export const removeCardFromDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id, card_id } = req.params;

    await DeckService.removeCardFromDeck(user.id, id, card_id);

    return res.json({ message: 'Carta removida del deck exitosamente' });
  } catch (error: any) {
    console.error('Error removiendo carta del deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error removiendo carta del deck' });
  }
};

// Actualizar cantidad de carta en deck
export const updateCardQuantity = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id, card_id } = req.params;
    const { quantity } = req.body;

    const deckCard = await DeckService.updateCardQuantity(user.id, id, card_id, quantity);

    return res.json(deckCard);
  } catch (error: any) {
    console.error('Error actualizando cantidad:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error actualizando cantidad de carta' });
  }
};

// Sincronizar todas las cartas del deck (elimina las anteriores y agrega las nuevas)
export const syncDeckCards = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // deck_id
    const { cards } = req.body; // Array de { card_id, quantity }

    const updatedDeck = await DeckService.syncDeckCards(user.id, id, cards);
    return res.json(updatedDeck);
  } catch (error: any) {
    console.error('Error sincronizando cartas del deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error sincronizando cartas del deck' });
  }
};

// Validar un deck
export const validateDeck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const validation = await DeckService.validateDeckForUser(userId, id);
    return res.json(validation);
  } catch (error: any) {
    console.error('Error validando deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error validando deck' });
  }
};

// Obtener estadísticas de un deck
export const getDeckStatistics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const stats = await DeckService.getDeckStatisticsForUser(userId, id);
    return res.json(stats);
  } catch (error: any) {
    console.error('Error obteniendo estadísticas del deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error obteniendo estadísticas del deck' });
  }
};

// Auto-generar deck
export const autoGenerateDeck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const response = await DeckService.autoGenerateDeckForUser(userId, id, req.body || {});
    return res.json(response);

  } catch (error: any) {
    console.error('Error generando deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ 
      error: error.message || 'Error generando deck automáticamente'
    });
  }
};

// Obtener cartas del deck (expandidas por quantity)
export const getDeckCards = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const shuffledCards = await DeckService.getDeckCardsExpandedForUser(user.id, id);
    
    console.log(`[Deck] Mazo ${id} mezclado: ${shuffledCards.length} cartas`);

    return res.json(shuffledCards);
  } catch (error: any) {
    console.error('Error obteniendo cartas del deck:', error);
    if (error instanceof ServiceError) {
      return res.status(error.status).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Error obteniendo cartas del deck' });
  }
};
