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
  userCardData: Array<{ card_id: string; quantity: number }>,
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
  const userCardIds = userCardData.map(uc => uc.card_id);
  const userCardQuantityMap = new Map(userCardData.map(uc => [uc.card_id, uc.quantity]));

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

  console.log(`[DeckGenerator] Estrategia: ${strategy}, Cartas disponibles: ${availableCards.length} únicas, ${Array.from(userCardQuantityMap.values()).reduce((a, b) => a + b, 0)} totales`);

  // Generar deck según estrategia
  let selectedCards: Map<string, number>;

  switch (strategy) {
    case 'balanced':
      selectedCards = generateBalancedDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
      break;
    case 'aggressive':
      selectedCards = generateAggressiveDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
      break;
    case 'defensive':
      selectedCards = generateDefensiveDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
      break;
    case 'element':
    case 'faction':
      selectedCards = generateThemedDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
      break;
    case 'random':
      selectedCards = generateRandomDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
      break;
    default:
      selectedCards = generateBalancedDeck(availableCards, targetCards, maxLegendaries, userCardQuantityMap);
  }

  console.log(`[DeckGenerator] Cartas seleccionadas: ${selectedCards.size}`);

  // Convertir a formato de respuesta
  const cards = Array.from(selectedCards.entries()).map(([card_id, quantity]) => ({
    card_id,
    quantity
  }));

  console.log(`[DeckGenerator] Array de cartas: ${cards.length}`);

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
  maxLegendaries: number,
  userCardQuantityMap: Map<string, number>
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  const legendaryCount = { value: 0 };

  // DEBUG: Ver qué tipos hay en las primeras 3 cartas
  console.log(`[generateBalancedDeck] DEBUG - Primeras 3 cartas:`);
  for (let i = 0; i < Math.min(3, cards.length); i++) {
    console.log(`  Card ${i}: type="${cards[i].type}" (${typeof cards[i].type}), name="${cards[i].name}"`);
  }

  // Separar cartas por tipo (búsqueda bilingüe: inglés y español)
  const knights = cards.filter(c => c.type === 'caballero' || c.type === 'knight');
  const techniques = cards.filter(c => c.type === 'tecnica' || c.type === 'technique');
  const objects = cards.filter(c => c.type === 'objeto' || c.type === 'item');
  const helpers = cards.filter(c => c.type === 'ayudante' || c.type === 'helper');
  const occasions = cards.filter(c => c.type === 'ocasion' || c.type === 'event');
  const stages = cards.filter(c => c.type === 'escenario' || c.type === 'stage');

  console.log(`[generateBalancedDeck] DEBUG - Filtros:`);
  console.log(`  Knights: ${knights.length}, Techniques: ${techniques.length}, Objects: ${objects.length}`);
  console.log(`  Helpers: ${helpers.length}, Occasions: ${occasions.length}, Stages: ${stages.length}`);

  // Composición balanceada:
  // 60% Caballeros (27 cartas)
  // 20% Técnicas (9 cartas)
  // 10% Objetos (4 cartas)
  // 5% Ayudantes (2 cartas)
  // 5% Ocasiones/Escenarios (3 cartas)

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.6), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, techniques, Math.floor(targetCards * 0.2), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, objects, Math.floor(targetCards * 0.1), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, helpers, Math.floor(targetCards * 0.05), maxLegendaries, legendaryCount, userCardQuantityMap);
  
  const miscCards = [...occasions, ...stages];
  totalCards += addCardsToSelection(selected, miscCards, targetCards - totalCards, maxLegendaries, legendaryCount, userCardQuantityMap);

  return selected;
}

/**
 * Deck agresivo - enfocado en ataque
 */
function generateAggressiveDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number,
  userCardQuantityMap: Map<string, number>
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  const legendaryCount = { value: 0 };

  // Filtrar cartas ofensivas (búsqueda bilingüe)
  const offensiveCards = cards.filter(c => {
    if (c.type === 'caballero' || c.type === 'knight') {
      const knight = (c as any).card_knight;
      return knight && knight.attack > knight.defense;
    }
    if (c.type === 'tecnica' || c.type === 'technique') {
      return c.tags?.includes('ofensiva') || c.cost <= 3;
    }
    return false;
  });

  // Composición agresiva:
  // 70% Caballeros ofensivos
  // 30% Técnicas rápidas

  const knights = offensiveCards.filter(c => c.type === 'caballero' || c.type === 'knight');
  const techniques = offensiveCards.filter(c => c.type === 'tecnica' || c.type === 'technique');

  // Priorizar cartas de bajo costo
  knights.sort((a, b) => a.cost - b.cost);
  techniques.sort((a, b) => a.cost - b.cost);

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.7), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, techniques, targetCards - totalCards, maxLegendaries, legendaryCount, userCardQuantityMap);

  return selected;
}

/**
 * Deck defensivo - control y resistencia
 */
function generateDefensiveDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number,
  userCardQuantityMap: Map<string, number>
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  const legendaryCount = { value: 0 };

  // Filtrar cartas defensivas (búsqueda bilingüe)
  const defensiveCards = cards.filter(c => {
    if (c.type === 'caballero' || c.type === 'knight') {
      const knight = (c as any).card_knight;
      return knight && knight.defense >= knight.attack;
    }
    if (c.type === 'tecnica' || c.type === 'technique' || c.type === 'objeto' || c.type === 'item') {
      return c.tags?.includes('defensiva') || c.tags?.includes('curacion');
    }
    return false;
  });

  const knights = defensiveCards.filter(c => c.type === 'caballero' || c.type === 'knight');
  const support = defensiveCards.filter(c => (c.type === 'tecnica' || c.type === 'technique' || c.type === 'objeto' || c.type === 'item'));

  // Priorizar resistencia
  knights.sort((a, b) => {
    const aKnight = (a as any).card_knight;
    const bKnight = (b as any).card_knight;
    return (bKnight?.defense || 0) - (aKnight?.defense || 0);
  });

  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.65), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, support, targetCards - totalCards, maxLegendaries, legendaryCount, userCardQuantityMap);

  return selected;
}

/**
 * Deck temático (elemento o facción)
 */
function generateThemedDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number,
  userCardQuantityMap: Map<string, number>
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  const legendaryCount = { value: 0 };

  // Separar por tipo (búsqueda bilingüe)
  const knights = cards.filter(c => c.type === 'caballero' || c.type === 'knight');
  const support = cards.filter(c => c.type !== 'caballero' && c.type !== 'knight');

  // 65% caballeros, 35% soporte
  totalCards += addCardsToSelection(selected, knights, Math.floor(targetCards * 0.65), maxLegendaries, legendaryCount, userCardQuantityMap);
  totalCards += addCardsToSelection(selected, support, targetCards - totalCards, maxLegendaries, legendaryCount, userCardQuantityMap);

  return selected;
}

/**
 * Deck aleatorio
 */
function generateRandomDeck(
  cards: Card[],
  targetCards: number,
  maxLegendaries: number,
  userCardQuantityMap: Map<string, number>
): Map<string, number> {
  const selected = new Map<string, number>();
  let totalCards = 0;
  const legendaryCount = { value: 0 };

  // Mezclar cartas
  const shuffled = [...cards].sort(() => Math.random() - 0.5);

  totalCards += addCardsToSelection(selected, shuffled, targetCards, maxLegendaries, legendaryCount, userCardQuantityMap);

  return selected;
}

/**
 * Agrega cartas a la selección respetando límites
 * Flexible: si hay pocas cartas disponibles, aumenta copias para alcanzar objetivo
 * Ahora usa las cantidades reales que el usuario posee
 */
function addCardsToSelection(
  selection: Map<string, number>,
  cards: Card[],
  targetCount: number,
  maxLegendaries: number,
  legendaryCountRef: { value: number },
  userCardQuantityMap: Map<string, number>
): number {
  if (cards.length === 0) {
    console.log(`[addCardsToSelection] Sin cartas disponibles, retornando 0`);
    return 0;
  }

  let added = 0;
  const neededCards = targetCount;

  console.log(`[addCardsToSelection] Comenzando con ${cards.length} cartas únicas, target: ${neededCards}, legendarias actuales: ${legendaryCountRef.value}/${maxLegendaries}`);

  for (const card of cards) {
    if (added >= neededCards) {
      console.log(`[addCardsToSelection] Target alcanzado (${added}/${neededCards}), saliendo del loop`);
      break;
    }

    // Verificar límite de legendarias
    if (card.rarity === 'legendary') {
      if (legendaryCountRef.value >= maxLegendaries) {
        console.log(`[addCardsToSelection] Carta legendaria ${card.name} rechazada: límite alcanzado (${legendaryCountRef.value}/${maxLegendaries})`);
        continue;
      }
    }

    // Obtener cantidad disponible del usuario
    const userHasQuantity = userCardQuantityMap.get(card.id) || 0;
    if (userHasQuantity === 0) {
      console.log(`[addCardsToSelection] Carta ${card.name} ignorada: usuario no tiene copias`);
      continue;
    }

    // Si quedan pocas cartas por agregar y pocas cartas disponibles, modo super flexible
    const cardsRestantes = cards.length - cards.indexOf(card);
    const espacioRestante = neededCards - added;
    const needsFlexibility = cardsRestantes > 0 && (espacioRestante / cardsRestantes) > 1;

    // Determinar cantidad máxima a agregar (respetando lo que usuario tiene)
    let maxQuantity = userHasQuantity;
    
    // Solo aplicar límites de rareza si NO estamos en modo flexible
    if (!needsFlexibility) {
      maxQuantity = Math.min(maxQuantity, card.max_copies || 3);
      if (card.unique) maxQuantity = Math.min(1, userHasQuantity);
      
      // Ajustar por rareza
      if (card.rarity === 'legendary' || card.rarity === 'epic') {
        maxQuantity = Math.min(maxQuantity, 1);
      } else if (card.rarity === 'rare') {
        maxQuantity = Math.min(maxQuantity, 2);
      }
    }

    // En modo flexible, ajustar cantidad basándose en lo que falta
    let quantity = maxQuantity;
    
    if (needsFlexibility) {
      // Necesitamos más copias por carta para alcanzar el objetivo
      const copiasPromedioPorCarta = Math.ceil(espacioRestante / cardsRestantes);
      // Permitir más copias si el usuario las tiene disponibles
      quantity = Math.min(userHasQuantity, copiasPromedioPorCarta);
      console.log(`[addCardsToSelection] Modo flexible: usando ${quantity} copias (usuario tiene ${userHasQuantity}, espacio: ${espacioRestante}, cartas: ${cardsRestantes})`);
    }

    // No exceder el objetivo
    const toAdd = Math.min(quantity, neededCards - added);
    
    if (toAdd > 0) {
      selection.set(card.id, toAdd);
      added += toAdd;
      
      if (card.rarity === 'legendary') {
        legendaryCountRef.value++;
      }
      console.log(`[addCardsToSelection] Agregada ${card.name} (${toAdd}x de ${userHasQuantity} disponibles, ${card.rarity}). Total agregadas: ${added}`);
    }
  }

  console.log(`[addCardsToSelection] Retornando: ${added} cartas agregadas, selection.size: ${selection.size}`);
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
  userCardData: Array<{ card_id: string; quantity: number }>,
  options: DeckGenerationOptions
): Promise<GeneratedDeck> {
  console.log(`\n[generateAndSaveDeck] INICIO - User: ${userId}, Deck: ${deckId}, Estrategia: ${options.strategy}`);
  console.log(`[generateAndSaveDeck] Cartas disponibles del usuario: ${userCardData.length} únicas, ${userCardData.reduce((sum, uc) => sum + uc.quantity, 0)} totales`);
  
  // Generar el deck
  const generatedDeck = await generateDeck(userCardData, options);
  
  console.log(`[generateAndSaveDeck] Deck generado:`);
  console.log(`  - Cartas en selection: ${generatedDeck.cards.length}`);
  console.log(`  - Total de cartas: ${generatedDeck.stats.total_cards}`);
  console.log(`  - By type: ${JSON.stringify(generatedDeck.stats.by_type)}`);
  console.log(`  - By rarity: ${JSON.stringify(generatedDeck.stats.by_rarity)}`);

  // Eliminar cartas existentes del deck
  console.log(`[generateAndSaveDeck] Eliminando cartas existentes del deck...`);
  const deleteResult = await DeckCard.destroy({
    where: { deck_id: deckId }
  });
  console.log(`[generateAndSaveDeck] Cartas eliminadas: ${deleteResult}`);

  // Insertar nuevas cartas
  const deckCards = generatedDeck.cards.map(card => ({
    deck_id: deckId,
    card_id: card.card_id,
    quantity: card.quantity
  }));
  
  console.log(`[generateAndSaveDeck] Preparadas para insertar: ${deckCards.length} registros`);
  console.log(`[generateAndSaveDeck] Primeras 3: ${JSON.stringify(deckCards.slice(0, 3))}`);

  if (deckCards.length > 0) {
    const bulkResult = await DeckCard.bulkCreate(deckCards);
    console.log(`[generateAndSaveDeck] Cartas insertadas exitosamente: ${bulkResult.length}`);
  } else {
    console.warn(`[generateAndSaveDeck] ⚠️ NO HAY CARTAS PARA INSERTAR`);
  }

  console.log(`[generateAndSaveDeck] FIN - Retornando generatedDeck\n`);
  return generatedDeck;
}
