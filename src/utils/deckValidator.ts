// src/utils/deckValidator.ts
import Card from '../models/Card';
import DeckCard from '../models/DeckCard';

export interface DeckValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DeckValidationRules {
  minCards: number;
  maxCards: number;
  maxCopiesPerCard: number;
  allowedTypes?: string[];
}

export const DEFAULT_DECK_RULES: DeckValidationRules = {
  minCards: 40,
  maxCards: 60,
  maxCopiesPerCard: 3
};

export async function validateDeck(
  deckCards: any[],
  rules: DeckValidationRules = DEFAULT_DECK_RULES
): Promise<DeckValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validar cantidad total de cartas
  const totalCards = deckCards.reduce((sum, dc) => sum + dc.quantity, 0);
  
  if (totalCards < rules.minCards) {
    errors.push(`El mazo debe tener al menos ${rules.minCards} cartas. Actual: ${totalCards}`);
  }
  
  if (totalCards > rules.maxCards) {
    errors.push(`El mazo no puede tener más de ${rules.maxCards} cartas. Actual: ${totalCards}`);
  }

  // Obtener datos completos de las cartas
  const cardIds = deckCards.map(dc => dc.card_id);
  const cards = await Card.findAll({
    where: { id: cardIds }
  });

  const cardMap = new Map(cards.map(c => [c.id, c]));

  // Validar cada carta
  for (const deckCard of deckCards) {
    const card = cardMap.get(deckCard.card_id);
    
    if (!card) {
      errors.push(`Carta con ID ${deckCard.card_id} no encontrada`);
      continue;
    }

    // Validar max_copies
    const maxAllowed = card.max_copies === 0 ? 1 : card.max_copies;
    
    if (deckCard.quantity > maxAllowed) {
      errors.push(
        `"${card.name}": máximo ${maxAllowed} copia(s) permitida(s), tienes ${deckCard.quantity}`
      );
    }

    // Validar tipos permitidos
    if (rules.allowedTypes && !rules.allowedTypes.includes(card.type)) {
      errors.push(
        `"${card.name}": tipo "${card.type}" no permitido en este formato`
      );
    }

    // Advertencia para cartas únicas
    if (card.unique && deckCard.quantity > 1) {
      warnings.push(
        `"${card.name}" es única. Solo puede haber 1 en el campo de juego simultáneamente`
      );
    }

    // Advertencia para cartas de alto poder
    if (card.power_level && card.power_level > 80) {
      warnings.push(
        `"${card.name}" tiene nivel de poder ${card.power_level} (muy alto). Considera el balance del mazo`
      );
    }
  }

  // Validar balance del mazo (advertencias)
  const typeCount: Record<string, number> = {};
  const rarityCount: Record<string, number> = {};
  
  for (const deckCard of deckCards) {
    const card = cardMap.get(deckCard.card_id);
    if (!card) continue;

    typeCount[card.type] = (typeCount[card.type] || 0) + deckCard.quantity;
    rarityCount[card.rarity] = (rarityCount[card.rarity] || 0) + deckCard.quantity;
  }

  // Advertir si hay muy pocos caballeros
  const knightCount = typeCount['caballero'] || 0;
  if (knightCount < 15) {
    warnings.push(
      `Solo tienes ${knightCount} caballeros. Se recomienda al menos 15 para un mazo balanceado`
    );
  }

  // Advertir si hay demasiadas cartas legendarias/divinas
  const legendaryCount = (rarityCount['legendaria'] || 0) + (rarityCount['divina'] || 0);
  if (legendaryCount > totalCards * 0.3) {
    warnings.push(
      `Tienes ${legendaryCount} cartas legendarias/divinas (${Math.round(legendaryCount/totalCards*100)}%). Considera reducir para mejor consistencia`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Validar deck existente en BD
export async function validateExistingDeck(deckId: string): Promise<DeckValidationResult> {
  const deckCards = await DeckCard.findAll({
    where: { deck_id: deckId }
  });

  return validateDeck(deckCards);
}

// Obtener estadísticas del deck
export async function getDeckStats(deckCards: any[]) {
  const cardIds = deckCards.map(dc => dc.card_id);
  const cards = await Card.findAll({
    where: { id: cardIds }
  });

  const cardMap = new Map(cards.map(c => [c.id, c]));

  const stats = {
    total_cards: 0,
    total_cost: 0,
    average_cost: 0,
    total_generate: 0,
    average_generate: 0,
    by_type: {} as Record<string, number>,
    by_rarity: {} as Record<string, number>,
    by_element: {} as Record<string, number>,
    unique_cards: 0,
    total_power_level: 0,
    average_power_level: 0
  };

  for (const deckCard of deckCards) {
    const card = cardMap.get(deckCard.card_id);
    if (!card) continue;

    const qty = deckCard.quantity;
    stats.total_cards += qty;
    stats.total_cost += card.cost * qty;
    stats.total_generate += card.generate * qty;
    
    if (card.power_level) {
      stats.total_power_level += card.power_level * qty;
    }

    stats.by_type[card.type] = (stats.by_type[card.type] || 0) + qty;
    stats.by_rarity[card.rarity] = (stats.by_rarity[card.rarity] || 0) + qty;
    
    if (card.element) {
      stats.by_element[card.element] = (stats.by_element[card.element] || 0) + qty;
    }

    if (card.unique) {
      stats.unique_cards++;
    }
  }

  if (stats.total_cards > 0) {
    stats.average_cost = Math.round((stats.total_cost / stats.total_cards) * 100) / 100;
    stats.average_generate = Math.round((stats.total_generate / stats.total_cards) * 100) / 100;
    stats.average_power_level = Math.round((stats.total_power_level / stats.total_cards) * 100) / 100;
  }

  return stats;
}
