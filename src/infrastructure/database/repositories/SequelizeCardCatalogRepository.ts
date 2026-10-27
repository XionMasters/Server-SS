import { Includeable, Op, WhereOptions } from 'sequelize';
import {
  CardCatalogRepository,
  CardListFilters,
  CardListQuery,
  CardRecord,
  CardSummaryField,
} from '../../../app/cards/card-catalog.repository';
import Card from '../models/Card';
import CardAbility from '../models/CardAbility';
import CardKnight from '../models/CardKnight';
import CardTranslation from '../models/CardTranslation';

const knightInclude = (): Includeable => ({
  model: CardKnight,
  as: 'card_knight',
  required: false,
});

const abilitiesInclude = (): Includeable => ({
  model: CardAbility,
  as: 'card_abilities',
  required: false,
});

const translationsInclude = (languages: string[]): Includeable => ({
  model: CardTranslation,
  as: 'translations',
  where: { language: { [Op.in]: languages } },
  required: false,
});

const buildRange = (min?: number, max?: number) => {
  const range: Record<symbol, number> = {};
  if (min !== undefined) range[Op.gte] = min;
  if (max !== undefined) range[Op.lte] = max;
  return range;
};

const buildWhere = (filters: CardListFilters): WhereOptions => {
  const where: Record<string, unknown> = {};

  if (filters.type) where.type = filters.type;
  if (filters.rarity) where.rarity = filters.rarity;
  if (filters.element) where.element = filters.element;
  if (filters.faction) where.faction = { [Op.iLike]: `%${filters.faction}%` };

  if (filters.costMin !== undefined || filters.costMax !== undefined) {
    where.cost = buildRange(filters.costMin, filters.costMax);
  }

  if (filters.powerLevelMin !== undefined || filters.powerLevelMax !== undefined) {
    where.power_level = buildRange(filters.powerLevelMin, filters.powerLevelMax);
  }

  if (filters.tags && filters.tags.length > 0) {
    where.tags = { [Op.overlap]: filters.tags };
  }

  if (filters.search) {
    where.name = { [Op.iLike]: `%${filters.search}%` };
  }

  return where as WhereOptions;
};

export class SequelizeCardCatalogRepository implements CardCatalogRepository {
  async findCards(query: CardListQuery): Promise<CardRecord[]> {
    const include: Includeable[] = [];
    if (query.includeStats) include.push(knightInclude());
    if (query.includeAbilities) include.push(abilitiesInclude());
    if (query.translationLanguages.length > 0) {
      include.push(translationsInclude(query.translationLanguages));
    }

    const cards = await Card.findAll({
      where: buildWhere(query.filters),
      include,
      limit: query.limit,
      offset: query.offset,
      order: [['name', 'ASC']],
    });

    return cards.map((card) => card.toJSON() as CardRecord);
  }

  async findCardById(cardId: string, translationLanguages: string[]): Promise<CardRecord | null> {
    const include: Includeable[] = [knightInclude(), abilitiesInclude()];
    if (translationLanguages.length > 0) {
      include.push(translationsInclude(translationLanguages));
    }

    const card = await Card.findByPk(cardId, { include });
    return card ? (card.toJSON() as CardRecord) : null;
  }

  async countCards(): Promise<number> {
    return Card.count();
  }

  async countMatching(filters: CardListFilters): Promise<number> {
    return Card.count({ where: buildWhere(filters) });
  }

  async countBy(field: CardSummaryField): Promise<CardRecord[]> {
    const rows = await Card.findAll({
      attributes: [field, [Card.sequelize!.fn('COUNT', Card.sequelize!.col(field)), 'count']],
      group: [field],
    });

    return rows.map((row) => row.toJSON() as CardRecord);
  }
}
