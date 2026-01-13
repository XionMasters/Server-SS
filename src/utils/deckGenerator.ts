// src/utils/deckGenerator.ts
// Auto-generador inteligente de mazos

import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import { Op } from 'sequelize';

export interface DeckGenerationOptions {
  strategy: 'balanced' | 'aggressive' | 'defensive' | 'element' | 'faction' | 'random';
  element?: string; // Para estrategia 'element'
  faction?: string; // Para estrategia 'faction'
  minCards?: number; // Default: 40
  maxCards?: number; // Default: 50
  targetCards?: number; // Default: 45
  preferredRarity?: 'common' | 'rare' | 'epic' | 'legendary';
  allowLegendaries?: boolean; // Default: true
  maxLegendaries?: number; // Default: 5
}

export interface GeneratedDeck {
  cards: Array<{
    card_id: string;
    quantity: number;
  }>;
  stats: {
    total_cards: number;
    avg_cost: number;
    avg_power_level: number;
    by_type: Record<string, number>;
    by_rarity: Record<string, number>;
    by_element: Record<string, number>;
  };
  strategy_used: string;
}

/**
 * Genera un mazo automáticamente basado en las cartas disponibles del usuario
 */
export async function generateDeck(
  userCardIds: string[],
  options: DeckGenerationOptions
): Promise<GeneratedDeck> {
  const {
    strategy,
    element,
    faction,
    minCards = 40,
    maxCards = 50,
    targetCards = 45,
    allowLegendaries = true,
    maxLegendaries = 5
  } = options;

  // Obtener todas las cartas disponibles del usuario
  const whereClause: any = {
    id: { [Op.in]: userCardIds }
  };

  // Aplicar filtros según estrategia
  if (strategy === 'element' && element) {
    whereClause.element = element;
  }
  if (strategy === 'faction' && faction) {
    whereClause.faction = faction;
  }

  const availableCards = await Card.findAll({
    where: whereClause,
    include: [{ model: CardKnight, as: 'card_knight' }]
  });

  if (availableCards.length === 0) {
    throw new Error('No hay cartas disponibles con los criterios seleccionados');
  }

  // Generar deck según estrategia
  let selectedCards: Map<string, number>;

  switch (strategy) {
    case 'balanced':
      selectedCards = generateBalancedDeck(availableCards, targetCards, maxLegendaries);
      break;
    case 'aggressive':
      selectedCards = generateAggressiveDeck(availableCards, targetCards, maxLegendaries);
      break;
    case 'defensive':
      selectedCards = generateDefensiveDeck(availableCards, targetCards, maxLegendaries);
      break;
    case 'element':
    case 'faction':
      selectedCards = generateThemedDeck(availableCards, targetCards, maxLegendaries);
      break;
    case 'random':
      selectedCards = generateRandomDeck(availableCards, targetCards, maxLegendaries);
      break;
    default:
      selectedCards = generateBalancedDeck(availableCards, targetCards, maxLegendaries);
  }

  // Convertir a formato de respuesta
  const cards = Array.from(selectedCards.entries()).map(([card_id, quantity]) => ({
    card_id,
    quantity
  }));

  // Calcular estadísticas
  const stats = calculateDeckStats(availableCards, selectedCards);

  return {
    cards,
    stats,
    strategy_used: strategy
  };
}

/**
 * Deck balanceado para principiantes
 */
function generateBalancedDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  let legendaryCount = 0;

  // Separar cartas por tipo
  const knights = cards.filter(c => c.type === 'knight');
  const techniques = cards.filter(c => c.type === 'technique');
  const objects = cards.filter(c => c.type === 'item');
  const helpers = cards.filter(c => c.type === 'helper');
  const occasions = cards.filter(c => c.type === 'event');
  const stages = cards.filter(c => c.type === 'stage');

  // Composición balanceada:
  // 60% Caballeros (27 cartas)
  // 20% Técnicas (9 cartas)
  // 10% Objetos (4 cartas)
  // 5% Ayudantes (2 cartas)
  // 5% Ocasiones/Escenarios (3 cartas)

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.6), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, techniques, Math.floor(targetCards * 0.2), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, objects, Math.floor(targetCards * 0.1), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, helpers, Math.floor(targetCards * 0.05), maxLegendaries, legendaryCount);
  
  const miscCards = [...occasions, ...stages];
  totalCards += addCardsToSelection(selected, miscCards, targetCards - totalCards, maxLegendaries, legendaryCount);

  return selected;
}

/**
 * Deck agresivo - enfocado en ataque
 */
function generateAggressiveDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  let legendaryCount = 0;

  // Filtrar cartas ofensivas
  const offensiveCards = cards.filter(c => {
    if (c.type === 'knight') {
      const knight = (c as any).card_knight;
      return knight && knight.attack > knight.defense;
    }
    if (c.type === 'technique') {
      return c.tags?.includes('ofensiva') || c.cost <= 3;
    }
    return false;
  });

  // Composición agresiva:
  // 70% Caballeros ofensivos
  // 30% Técnicas rápidas

  const knights = offensiveCards.filter(c => c.type === 'knight');
  const techniques = offensiveCards.filter(c => c.type === 'technique');

  // Priorizar cartas de bajo costo
  knights.sort((a, b) => a.cost - b.cost);
  techniques.sort((a, b) => a.cost - b.cost);

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.7), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, techniques, targetCards - totalCards, maxLegendaries, legendaryCount);

  return selected;
}

/**
 * Deck defensivo - control y resistencia
 */
function generateDefensiveDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  let legendaryCount = 0;

  // Filtrar cartas defensivas
  const defensiveCards = cards.filter(c => {
    if (c.type === 'knight') {
      const knight = (c as any).card_knight;
      return knight && knight.defense >= knight.attack;
    }
    if (c.type === 'technique' || c.type === 'item') {
      return c.tags?.includes('defensiva') || c.tags?.includes('curacion');
    }
    return false;
  });

  const knights = defensiveCards.filter(c => c.type === 'knight');
  const support = defensiveCards.filter(c => c.type === 'technique' || c.type === 'item');

  // Priorizar resistencia
  knights.sort((a, b) => {
    const aKnight = (a as any).card_knight;
    const bKnight = (b as any).card_knight;
    return (bKnight?.defense || 0) - (aKnight?.defense || 0);
  });

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.65), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, support, targetCards - totalCards, maxLegendaries, legendaryCount);

  return selected;
}

/**
 * Deck temático (elemento o facción)
 */
function generateThemedDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  let legendaryCount = 0;

  // Separar por tipo
  const knights = cards.filter(c => c.type === 'knight');
  const support = cards.filter(c => c.type !== 'knight');

  // 65% caballeros, 35% soporte
  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.65), maxLegendaries, legendaryCount);
  totalCards += addCardsToSelection(selected, support, targetCards - totalCards, maxLegendaries, legendaryCount);

  return selected;
}

/**
 * Deck aleatorio
 */
function generateRandomDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  let legendaryCount = 0;

  // Mezclar cartas
  const shuffled = [...cards].sort(() => Math.random() - 0.5);

  totalCards += addCardsToSelection(selected, shuffled, targetCards, maxLegendaries, legendaryCount);

  return selected;
}

/**
 * Agrega cartas a la selección respetando límites
 */
function addCardsToSelection(
  selection: Map<string, number>,
  cards: Card[],
  targetCount: number,
  maxLegendaries: number,
  currentLegendaries: number
): number {
  let added = 0;
  let legendaryCount = currentLegendaries;

  for (const card of cards) {
    if (added >= targetCount) break;

    // Verificar límite de legendarias
    if (card.rarity === 'legendary') {
      if (legendaryCount >= maxLegendaries) continue;
    }

    // Determinar cantidad a agregar
    let quantity = card.max_copies || 3;
    if (card.unique) quantity = 1;
    
    // Ajustar por rareza (más comunes = más copias)
    if (card.rarity === 'legendary' || card.rarity === 'epic') {
      quantity = Math.min(quantity, 1);
    } else if (card.rarity === 'rare') {
      quantity = Math.min(quantity, 2);
    }

    // No exceder el objetivo
    const toAdd = Math.min(quantity, targetCount - added);
    
    if (toAdd > 0) {
      selection.set(card.id, toAdd);
      added += toAdd;
      
      if (card.rarity === 'legendary') {
        legendaryCount++;
      }
    }
  }

  return added;
}

/**
 * Calcula estadísticas del deck generado
 */
function calculateDeckStats(
  allCards: Card[],
  selection: Map<string, number>
) {
  let totalCards = 0;
  let totalCost = 0;
  let totalPowerLevel = 0;
  const byType: Record<string, number> = {};
  const byRarity: Record<string, number> = {};
  const byElement: Record<string, number> = {};

  for (const [cardId, quantity] of selection.entries()) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) continue;

    totalCards += quantity;
    totalCost += card.cost * quantity;
    totalPowerLevel += (card.power_level || 5) * quantity;

    byType[card.type] = (byType[card.type] || 0) + quantity;
    byRarity[card.rarity] = (byRarity[card.rarity] || 0) + quantity;
    if (card.element) {
      byElement[card.element] = (byElement[card.element] || 0) + quantity;
    }
  }

  return {
    total_cards: totalCards,
    avg_cost: totalCards > 0 ? totalCost / totalCards : 0,
    avg_power_level: totalCards > 0 ? totalPowerLevel / totalCards : 0,
    by_type: byType,
    by_rarity: byRarity,
    by_element: byElement
  };
}

/**
 * Genera un deck y lo guarda en la base de datos
 */
export async function generateAndSaveDeck(
  userId: string,
  deckId: string,
  userCardIds: string[],
  options: DeckGenerationOptions
): Promise<GeneratedDeck> {
  // Generar el deck
  const generatedDeck = await generateDeck(userCardIds, options);

  // Eliminar cartas existentes del deck
  await DeckCard.destroy({
    where: { deck_id: deckId }
  });

  // Insertar nuevas cartas
  const deckCards = generatedDeck.cards.map(card => ({
    deck_id: deckId,
    card_id: card.card_id,
    quantity: card.quantity
  }));

  await DeckCard.bulkCreate(deckCards);

  return generatedDeck;
}
