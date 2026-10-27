import {
  CardCatalogRepository,
  CardListFilters,
  CardRecord,
} from './card-catalog.repository';
import { applyCardTranslation, translationLanguagesFor } from './card-translation';

export interface ListCardsInput {
  filters: CardListFilters;
  lang: string;
  includeStats: boolean;
  includeAbilities: boolean;
  limit: number;
  offset: number;
}

export interface CardSummary {
  total: number;
  by_type: CardRecord[];
  by_rarity: CardRecord[];
  by_element: CardRecord[];
}

// Holgado para que el cliente pueda seguir pidiendo el catálogo completo de una vez
export const CARD_LIST_MAX_LIMIT = 1000;

export class CardCatalogUseCases {
  constructor(private readonly cardCatalogRepository: CardCatalogRepository) {}

  async listCards(input: ListCardsInput): Promise<CardRecord[]> {
    const cards = await this.cardCatalogRepository.findCards({
      filters: input.filters,
      includeStats: input.includeStats,
      includeAbilities: input.includeAbilities,
      translationLanguages: translationLanguagesFor(input.lang),
      limit: Math.min(input.limit, CARD_LIST_MAX_LIMIT),
      offset: input.offset,
    });

    return cards.map((card) => applyCardTranslation(card, input.lang));
  }

  countCards(filters: CardListFilters): Promise<number> {
    return this.cardCatalogRepository.countMatching(filters);
  }

  async getCard(cardId: string, lang: string): Promise<CardRecord | null> {
    const card = await this.cardCatalogRepository.findCardById(cardId, translationLanguagesFor(lang));
    return card ? applyCardTranslation(card, lang) : null;
  }

  async getSummary(): Promise<CardSummary> {
    const [total, byType, byRarity, byElement] = await Promise.all([
      this.cardCatalogRepository.countCards(),
      this.cardCatalogRepository.countBy('type'),
      this.cardCatalogRepository.countBy('rarity'),
      this.cardCatalogRepository.countBy('element'),
    ]);

    return {
      total,
      by_type: byType,
      by_rarity: byRarity,
      by_element: byElement,
    };
  }
}
