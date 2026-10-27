import {
  DEFAULT_DECK_CONSTRUCTION_RULES,
  getCardDeckCopyLimit,
} from '../../config/deck-rules.config';
import Card from '../../infrastructure/database/models/Card';
import { DeckServiceError } from './deck.errors';

export interface RequestedDeckCard {
  card_id: string;
  quantity: number;
}

export function normalizeQuantity(quantity: number): number {
  const parsedQuantity = Number(quantity);

  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
    throw new DeckServiceError(400, 'La cantidad debe ser un entero mayor a 0');
  }

  return parsedQuantity;
}

// Solo limita el máximo: un mazo en edición puede tener menos del mínimo.
// El mínimo se valida al preparar la partida (DeckBattleService).
export function assertDeckSizeLimit(totalCards: number): void {
  if (totalCards > DEFAULT_DECK_CONSTRUCTION_RULES.maxCards) {
    throw new DeckServiceError(
      400,
      `El mazo no puede tener más de ${DEFAULT_DECK_CONSTRUCTION_RULES.maxCards} cartas. Actual: ${totalCards}`
    );
  }
}

export function validateDeckName(rawName: string): string {
  const trimmedName = rawName.trim();

  if (trimmedName.length < 3) {
    throw new DeckServiceError(400, 'El nombre del deck debe tener al menos 3 caracteres');
  }

  if (trimmedName.length > 100) {
    throw new DeckServiceError(400, 'El nombre del deck no puede superar 100 caracteres');
  }

  return trimmedName;
}

export function assertCardQuantityAllowed(
  card: Card,
  requestedQuantity: number,
  ownedQuantity: number
): void {
  const maxByCard = getCardDeckCopyLimit(card.max_copies);

  if (requestedQuantity > maxByCard) {
    throw new DeckServiceError(400, `"${card.name}": máximo ${maxByCard} copia(s) permitida(s)`);
  }

  if (requestedQuantity > ownedQuantity) {
    throw new DeckServiceError(
      400,
      `"${card.name}": solo tienes ${ownedQuantity} copia(s) en tu colección`
    );
  }
}

export function normalizeSyncPayload(cards: RequestedDeckCard[]): RequestedDeckCard[] {
  const seenCardIds = new Set<string>();

  return cards.map((cardData) => {
    if (!cardData || typeof cardData.card_id !== 'string' || cardData.card_id.trim() === '') {
      throw new DeckServiceError(400, 'Cada entrada del mazo debe incluir un card_id válido');
    }

    if (seenCardIds.has(cardData.card_id)) {
      throw new DeckServiceError(
        400,
        `La carta ${cardData.card_id} está repetida en la sincronización del mazo`
      );
    }

    seenCardIds.add(cardData.card_id);
    return {
      card_id: cardData.card_id,
      quantity: normalizeQuantity(cardData.quantity),
    };
  });
}

export function shuffleArray<T>(array: T[], random: () => number = Math.random): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
