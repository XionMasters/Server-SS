export type QueryValue = string | string[];

// Registro plano de carta tal como se serializa hacia el cliente.
export type CardRecord = Record<string, any>;

export interface CardListFilters {
  type?: QueryValue;
  rarity?: QueryValue;
  element?: QueryValue;
  faction?: string;
  costMin?: number;
  costMax?: number;
  powerLevelMin?: number;
  powerLevelMax?: number;
  tags?: string[];
  search?: string;
}

export interface CardListQuery {
  filters: CardListFilters;
  includeStats: boolean;
  includeAbilities: boolean;
  translationLanguages: string[];
  limit: number;
  offset: number;
}

export type CardSummaryField = 'type' | 'rarity' | 'element';

export interface CardCatalogRepository {
  findCards(query: CardListQuery): Promise<CardRecord[]>;
  findCardById(cardId: string, translationLanguages: string[]): Promise<CardRecord | null>;
  countCards(): Promise<number>;
  /** Total de cartas que cumplen los filtros (sin paginar). */
  countMatching(filters: CardListFilters): Promise<number>;
  countBy(field: CardSummaryField): Promise<CardRecord[]>;
}
