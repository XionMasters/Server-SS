// Gestión de cartas desde el panel admin.
import { validateCardBody } from './card-admin.validation';

export type CardRecord = Record<string, any>;

export interface AdminCardListFilters {
  type?: string;
  rarity?: string;
  element?: string;
  faction?: string;
  search?: string;
  costMin?: number;
  costMax?: number;
}

export interface CardUsage {
  owners: number;
  decks: number;
  activeMatches: number;
}

export interface CardAdminRepository {
  listCards(filters: AdminCardListFilters, limit: number, offset: number): Promise<{ total: number; cards: CardRecord[] }>;
  findCardDetail(cardId: string): Promise<CardRecord | null>;
  /** Crea (cardId = null) o actualiza la carta con stats, habilidades y traducciones en una transacción. */
  saveCard(cardId: string | null, body: CardRecord): Promise<CardRecord>;
  getCardUsage(cardId: string): Promise<CardUsage>;
  /** Borra la carta y sus datos asociados. Devuelve false si no existe. */
  deleteCard(cardId: string): Promise<boolean>;
}

export class CardAdminError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CardAdminError';
  }
}

export const ADMIN_CARD_LIST_MAX_LIMIT = 200;

export class CardAdminUseCases {
  constructor(
    private readonly repository: CardAdminRepository,
    // Se avisa tras cada escritura confirmada (p. ej. para invalidar cachés)
    private readonly onCardChanged: (cardId: string) => void = () => {}
  ) {}

  listCards(filters: AdminCardListFilters, limit: number, offset: number) {
    return this.repository.listCards(filters, Math.min(limit, ADMIN_CARD_LIST_MAX_LIMIT), offset);
  }

  async getCard(cardId: string): Promise<CardRecord> {
    const card = await this.repository.findCardDetail(cardId);
    if (!card) throw new CardAdminError(404, 'Carta no encontrada');
    return card;
  }

  async createCard(body: unknown): Promise<CardRecord> {
    const card = await this.repository.saveCard(null, validateCardBody(body, 'create'));
    this.onCardChanged(card.id);
    return card;
  }

  async updateCard(cardId: string, body: unknown): Promise<CardRecord> {
    const card = await this.repository.saveCard(cardId, validateCardBody(body, 'update'));
    this.onCardChanged(cardId);
    return card;
  }

  // Sólo se puede eliminar si la carta NO está en uso (colecciones, mazos, partidas activas)
  async deleteCard(cardId: string): Promise<void> {
    if (!(await this.repository.findCardDetail(cardId))) {
      throw new CardAdminError(404, 'Carta no encontrada');
    }

    const usage = await this.repository.getCardUsage(cardId);
    if (usage.owners > 0 || usage.decks > 0 || usage.activeMatches > 0) {
      throw new CardAdminError(409, 'No se puede eliminar: la carta está en uso', {
        en_inventarios: usage.owners,
        en_mazos: usage.decks,
        en_partidas: usage.activeMatches,
      });
    }

    if (!(await this.repository.deleteCard(cardId))) {
      throw new CardAdminError(404, 'Carta no encontrada');
    }
    this.onCardChanged(cardId);
  }
}
