// src/controllers/decks.controller.ts
import { Request, Response } from 'express';
import Deck from '../models/Deck';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import UserCard from '../models/UserCard';
import { validateDeck as validateDeckUtil, validateExistingDeck, getDeckStats } from '../utils/deckValidator';
import { generateAndSaveDeck, DeckGenerationOptions } from '../utils/deckGenerator';

// ============================================================================
// UTILITY: Shuffle array using Fisher-Yates algorithm
// ============================================================================
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]; // Crear copia para no mutar original
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Obtener todos los decks del usuario
export const getUserDecks = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    const decks = await Deck.findAll({
      where: { user_id: user.id },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json(decks);
  } catch (error: any) {
    console.error('Error obteniendo decks:', error);
    return res.status(500).json({ error: 'Error obteniendo decks del usuario' });
  }
};

// Obtener un deck específico
export const getDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const deck = await Deck.findOne({
      where: { id, user_id: user.id },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ]
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    return res.json(deck);
  } catch (error: any) {
    console.error('Error obteniendo deck:', error);
    return res.status(500).json({ error: 'Error obteniendo deck' });
  }
};

// Crear un nuevo deck
export const createDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { name, description } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'El nombre del deck es requerido' });
    }

    const deck = await Deck.create({
      user_id: user.id,
      name: name.trim(),
      description: description?.trim(),
      is_active: false
    });

    return res.status(201).json(deck);
  } catch (error: any) {
    console.error('Error creando deck:', error);
    return res.status(500).json({ error: 'Error creando deck' });
  }
};

// Actualizar deck
export const updateDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    if (name !== undefined) deck.name = name.trim();
    if (description !== undefined) deck.description = description?.trim();
    if (is_active !== undefined) {
      // Si se activa este deck, desactivar los demás
      if (is_active) {
        await Deck.update(
          { is_active: false },
          { where: { user_id: user.id } }
        );
      }
      deck.is_active = is_active;
    }

    await deck.save();

    return res.json(deck);
  } catch (error: any) {
    console.error('Error actualizando deck:', error);
    return res.status(500).json({ error: 'Error actualizando deck' });
  }
};

// Eliminar deck
export const deleteDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    await deck.destroy();

    return res.json({ message: 'Deck eliminado exitosamente' });
  } catch (error: any) {
    console.error('Error eliminando deck:', error);
    return res.status(500).json({ error: 'Error eliminando deck' });
  }
};

// Agregar carta al deck
export const addCardToDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // deck_id
    const { card_id, quantity = 1 } = req.body;

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Verificar que la carta existe
    const card = await Card.findByPk(card_id);
    if (!card) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }

    // Verificar max_copies de la carta
    const maxAllowed = card.max_copies === 0 ? 1 : card.max_copies;

    // Verificar si la carta ya está en el deck
    const existingDeckCard = await DeckCard.findOne({
      where: { deck_id: id, card_id }
    });

    if (existingDeckCard) {
      // Actualizar cantidad respetando max_copies
      const newQuantity = Math.min(existingDeckCard.quantity + quantity, maxAllowed);
      
      if (newQuantity === existingDeckCard.quantity) {
        return res.status(400).json({ 
          error: `"${card.name}" ya tiene el máximo de ${maxAllowed} copia(s) permitida(s)` 
        });
      }
      
      existingDeckCard.quantity = newQuantity;
      await existingDeckCard.save();
      return res.json(existingDeckCard);
    } else {
      // Agregar nueva carta respetando max_copies
      const deckCard = await DeckCard.create({
        deck_id: id,
        card_id,
        quantity: Math.min(quantity, maxAllowed)
      });
      return res.status(201).json(deckCard);
    }
  } catch (error: any) {
    console.error('Error agregando carta al deck:', error);
    return res.status(500).json({ error: 'Error agregando carta al deck' });
  }
};

// Remover carta del deck
export const removeCardFromDeck = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id, card_id } = req.params;

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    const deckCard = await DeckCard.findOne({
      where: { deck_id: id, card_id }
    });

    if (!deckCard) {
      return res.status(404).json({ error: 'Carta no encontrada en el deck' });
    }

    await deckCard.destroy();

    return res.json({ message: 'Carta removida del deck exitosamente' });
  } catch (error: any) {
    console.error('Error removiendo carta del deck:', error);
    return res.status(500).json({ error: 'Error removiendo carta del deck' });
  }
};

// Actualizar cantidad de carta en deck
export const updateCardQuantity = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id, card_id } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
    }

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Obtener carta para verificar max_copies
    const card = await Card.findByPk(card_id);
    if (!card) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }

    const maxAllowed = card.max_copies === 0 ? 1 : card.max_copies;

    if (quantity > maxAllowed) {
      return res.status(400).json({ 
        error: `"${card.name}": máximo ${maxAllowed} copia(s) permitida(s)` 
      });
    }

    const deckCard = await DeckCard.findOne({
      where: { deck_id: id, card_id }
    });

    if (!deckCard) {
      return res.status(404).json({ error: 'Carta no encontrada en el deck' });
    }

    deckCard.quantity = quantity;
    await deckCard.save();

    return res.json(deckCard);
  } catch (error: any) {
    console.error('Error actualizando cantidad:', error);
    return res.status(500).json({ error: 'Error actualizando cantidad de carta' });
  }
};

// Sincronizar todas las cartas del deck (elimina las anteriores y agrega las nuevas)
export const syncDeckCards = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params; // deck_id
    const { cards } = req.body; // Array de { card_id, quantity }

    if (!Array.isArray(cards)) {
      return res.status(400).json({ error: 'Se requiere un array de cartas' });
    }

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: user.id }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Eliminar todas las cartas actuales del deck
    await DeckCard.destroy({
      where: { deck_id: id }
    });

    // Agregar las nuevas cartas
    for (const cardData of cards) {
      const { card_id, quantity } = cardData;
      
      // Verificar que la carta existe
      const card = await Card.findByPk(card_id);
      if (!card) {
        continue; // Saltar cartas inválidas
      }

      await DeckCard.create({
        deck_id: id,
        card_id,
        quantity: Math.min(Math.max(quantity, 1), card.max_copies === 0 ? 1 : card.max_copies)
      });
    }

    // Retornar el deck completo con las cartas actualizadas
    const updatedDeck = await Deck.findOne({
      where: { id },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ]
    });

    return res.json(updatedDeck);
  } catch (error: any) {
    console.error('Error sincronizando cartas del deck:', error);
    return res.status(500).json({ error: 'Error sincronizando cartas del deck' });
  }
};

// Validar un deck
export const validateDeck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: userId }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Validar usando la utilidad
    const validation = await validateExistingDeck(id);

    return res.json({
      valid: validation.valid,
      errors: validation.errors,
      warnings: validation.warnings,
      deck_name: deck.name
    });
  } catch (error: any) {
    console.error('Error validando deck:', error);
    return res.status(500).json({ error: 'Error validando deck' });
  }
};

// Obtener estadísticas de un deck
export const getDeckStatistics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: userId }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Obtener cartas del deck
    const deckCards = await DeckCard.findAll({
      where: { deck_id: id },
      include: [
        {
          model: Card,
          as: 'card',
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ]
    });

    // Calcular estadísticas
    const stats = getDeckStats(deckCards);

    return res.json({
      deck_name: deck.name,
      ...stats
    });
  } catch (error: any) {
    console.error('Error obteniendo estadísticas del deck:', error);
    return res.status(500).json({ error: 'Error obteniendo estadísticas del deck' });
  }
};

// Auto-generar deck
export const autoGenerateDeck = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user.id;
    const {
      strategy = 'balanced',
      element,
      faction,
      targetCards = 45,
      maxLegendaries = 5
    } = req.body;

    // Verificar que el deck existe y pertenece al usuario
    const deck = await Deck.findOne({
      where: { id, user_id: userId }
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Obtener todas las cartas del usuario
    const userCards = await UserCard.findAll({
      where: { user_id: userId }
    });

    if (userCards.length === 0) {
      return res.status(400).json({ 
        error: 'No tienes cartas en tu colección',
        suggestion: 'Abre algunos sobres primero'
      });
    }

    const userCardIds = userCards.map(uc => uc.card_id);

    // Validar estrategia
    const validStrategies = ['balanced', 'aggressive', 'defensive', 'element', 'faction', 'random'];
    if (!validStrategies.includes(strategy)) {
      return res.status(400).json({ 
        error: 'Estrategia inválida',
        valid_strategies: validStrategies
      });
    }

    // Validar parámetros específicos
    if (strategy === 'element' && !element) {
      return res.status(400).json({ error: 'Debe especificar un elemento para la estrategia "element"' });
    }
    if (strategy === 'faction' && !faction) {
      return res.status(400).json({ error: 'Debe especificar una facción para la estrategia "faction"' });
    }

    // Opciones de generación
    const options: DeckGenerationOptions = {
      strategy,
      element,
      faction,
      targetCards,
      maxLegendaries
    };

    // Generar y guardar el deck
    const generatedDeck = await generateAndSaveDeck(userId, id, userCardIds, options);

    // Retornar deck actualizado con cartas
    const updatedDeck = await Deck.findOne({
      where: { id },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ]
    });

    return res.json({
      message: 'Deck generado exitosamente',
      deck: updatedDeck,
      generation_info: {
        strategy_used: generatedDeck.strategy_used,
        stats: generatedDeck.stats
      }
    });

  } catch (error: any) {
    console.error('Error generando deck:', error);
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

    const deck = await Deck.findOne({
      where: { id, user_id: user.id },
      include: [
        {
          model: Card,
          as: 'cards',
          through: { attributes: ['quantity'] },
          include: [{ model: CardKnight, as: 'card_knight' }]
        }
      ]
    });

    if (!deck) {
      return res.status(404).json({ error: 'Deck no encontrado' });
    }

    // Expandir cartas por quantity desde la relación belongsToMany
    const expandedCards = [];
    const cards = (deck as any).cards || [];
    for (const card of cards) {
      const quantity = card.DeckCard?.quantity || 1;
      for (let i = 0; i < quantity; i++) {
        expandedCards.push(card);
      }
    }

    // ✨ SHUFFLE: Mezclar el mazo antes de retornar
    const shuffledCards = shuffleArray(expandedCards);
    
    console.log(`[Deck] Mazo ${id} mezclado: ${expandedCards.length} cartas`);

    return res.json(shuffledCards);
  } catch (error: any) {
    console.error('Error obteniendo cartas del deck:', error);
    return res.status(500).json({ error: 'Error obteniendo cartas del deck' });
  }
};
