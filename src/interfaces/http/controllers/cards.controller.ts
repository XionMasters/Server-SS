import { Request, Response } from 'express';
import { CardListFilters, QueryValue } from '../../../app/cards/card-catalog.repository';
import { CardCatalogUseCases } from '../../../app/cards/card-catalog.use-cases';
import { SequelizeCardCatalogRepository } from '../../../infrastructure/database/repositories/SequelizeCardCatalogRepository';

const cardCatalog = new CardCatalogUseCases(new SequelizeCardCatalogRepository());

const DEFAULT_LANG = 'en';
const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;

const firstString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return firstString(value[0]);
  return typeof value === 'string' && value !== '' ? value : undefined;
};

// Conserva arrays (?type=a&type=b se filtra con IN, igual que antes).
const queryValue = (value: unknown): QueryValue | undefined => {
  if (Array.isArray(value)) {
    const strings = value.filter((item): item is string => typeof item === 'string' && item !== '');
    return strings.length > 0 ? strings : undefined;
  }
  return firstString(value);
};

const parseInteger = (value: unknown): number | undefined => {
  const raw = firstString(value);
  if (raw === undefined) return undefined;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseLang = (value: unknown): string => firstString(value) ?? DEFAULT_LANG;

const parseFilters = (query: Request['query']): CardListFilters => ({
  type: queryValue(query.type),
  rarity: queryValue(query.rarity),
  element: queryValue(query.element),
  faction: firstString(query.faction),
  costMin: parseInteger(query.cost_min),
  costMax: parseInteger(query.cost_max),
  powerLevelMin: parseInteger(query.power_level_min),
  powerLevelMax: parseInteger(query.power_level_max),
  tags: firstString(query.tags)?.split(','),
  search: firstString(query.search),
});

export const listCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const filters = parseFilters(req.query);
    const [cards, totalCount] = await Promise.all([
      cardCatalog.listCards({
        filters,
        lang: parseLang(req.query.lang),
        includeStats: firstString(req.query.include_stats) === 'true',
        includeAbilities: firstString(req.query.include_abilities) === 'true',
        limit: parseInteger(req.query.limit) ?? DEFAULT_LIMIT,
        offset: parseInteger(req.query.offset) ?? DEFAULT_OFFSET,
      }),
      cardCatalog.countCards(filters),
    ]);

    // `total` es el tamaño de la página devuelta (contrato existente);
    // `total_count` es el total real con los filtros, para paginar.
    res.json({
      total: cards.length,
      total_count: totalCount,
      cards,
    });
  } catch (error) {
    console.error('Error obteniendo cartas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const getCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await cardCatalog.getCard(req.params.id as string, parseLang(req.query.lang));

    if (!card) {
      res.status(404).json({ error: 'Carta no encontrada' });
      return;
    }

    res.json(card);
  } catch (error) {
    console.error('Error obteniendo carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const getCardSummary = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await cardCatalog.getSummary());
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
