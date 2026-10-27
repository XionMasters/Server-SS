import { Op } from 'sequelize';
import {
  AdminCardListFilters,
  CardAdminError,
  CardAdminRepository,
  CardRecord,
  CardUsage,
} from '../../../app/admin/card-admin';
import { sequelize } from '../../../config/database';
import { Card, CardInPlay, CardKnight, DeckCard, UserCard } from '../models/associations';
import CardAbility from '../models/CardAbility';
import CardTranslation from '../models/CardTranslation';

const detailInclude = () => [
  { model: CardKnight, as: 'card_knight', required: false },
  { model: CardAbility, as: 'card_abilities', required: false },
  { model: CardTranslation, as: 'translations', required: false },
];

const buildWhere = (filters: AdminCardListFilters) => {
  const where: any = {};
  if (filters.type)    where.type    = filters.type;
  if (filters.rarity)  where.rarity  = filters.rarity;
  if (filters.element) where.element = filters.element;
  if (filters.faction) where.faction = { [Op.iLike]: `%${filters.faction}%` };
  if (filters.search)  where[Op.or]  = [
    { name: { [Op.iLike]: `%${filters.search}%` } },
    { code: { [Op.iLike]: `%${filters.search}%` } },
  ];
  if (filters.costMin !== undefined) where.cost = { ...(where.cost || {}), [Op.gte]: filters.costMin };
  if (filters.costMax !== undefined) where.cost = { ...(where.cost || {}), [Op.lte]: filters.costMax };
  return where;
};

export class SequelizeCardAdminRepository implements CardAdminRepository {
  async listCards(filters: AdminCardListFilters, limit: number, offset: number) {
    const where = buildWhere(filters);
    const [cards, total] = await Promise.all([
      Card.findAll({
        where,
        include: [{ model: CardKnight, as: 'card_knight', required: false }],
        limit,
        offset,
        order: [['name', 'ASC']],
      }),
      Card.count({ where }),
    ]);

    return { total, cards: cards.map((card) => card.toJSON() as CardRecord) };
  }

  async findCardDetail(cardId: string): Promise<CardRecord | null> {
    const card = await Card.findByPk(cardId, { include: detailInclude() });
    return card ? (card.toJSON() as CardRecord) : null;
  }

  async saveCard(cardId: string | null, body: CardRecord): Promise<CardRecord> {
    const { translations = {}, stats, abilities, ...cardFields } = body;
    const esT: any = (translations as any).es || {};
    const name = esT.name || cardFields.name;
    const description = esT.description ?? cardFields.description ?? null;

    const cid = await sequelize.transaction(async (t) => {
      let card: any;
      if (cardId) {
        card = await Card.findByPk(cardId, { transaction: t });
        if (!card) throw new CardAdminError(404, 'Carta no encontrada');
        await card.update({ ...cardFields, name, description }, { transaction: t });
      } else {
        if (await Card.findOne({ where: { code: cardFields.code }, transaction: t })) {
          throw new CardAdminError(409, `Ya existe una carta con code '${cardFields.code}'`);
        }
        card = await Card.create({ ...cardFields, name, description }, { transaction: t });
      }
      const id: string = card.id;

      // Knight stats
      if (stats !== undefined) {
        const existingK: any = await CardKnight.findOne({ where: { card_id: id }, transaction: t });
        if (stats === null) {
          if (existingK) await existingK.destroy({ transaction: t });
        } else if (existingK) {
          await existingK.update(stats, { transaction: t });
        } else {
          await CardKnight.create({ ...stats, card_id: id }, { transaction: t });
        }
      }

      // Abilities: full replace
      if (abilities !== undefined) {
        await CardAbility.destroy({ where: { card_id: id }, transaction: t });
        for (const ab of abilities as any[]) {
          const { id: _i, card_id: _c, ...abFields } = ab;
          await CardAbility.create({ ...abFields, card_id: id }, { transaction: t });
        }
      }

      // Translations for EN and PT (ES stays in cards.name)
      for (const lang of ['en', 'pt'] as const) {
        const langT: any = (translations as any)[lang];
        if (!langT?.name) continue;

        const abilityTranslations: Record<string, { name: string; description: string }> = {};
        if (Array.isArray(langT.abilities) && langT.abilities.length > 0) {
          const dbAbs: any[] = await CardAbility.findAll({ where: { card_id: id }, transaction: t }) as any[];
          const keyToId = new Map(dbAbs.map((a: any) => [a.ability_key, a.id]));
          for (const abT of langT.abilities) {
            const abId = keyToId.get(abT.key);
            if (abId) abilityTranslations[abId] = { name: abT.name || '', description: abT.description || '' };
          }
        }

        const existingT: any = await CardTranslation.findOne({ where: { card_id: id, language: lang }, transaction: t });
        const payload = { name: langT.name, description: langT.description || null, ability_translations: abilityTranslations };
        if (existingT) {
          await existingT.update(payload, { transaction: t });
        } else {
          await CardTranslation.create({ ...payload, card_id: id, language: lang }, { transaction: t });
        }
      }

      return id;
    });

    return (await this.findCardDetail(cid))!;
  }

  async getCardUsage(cardId: string): Promise<CardUsage> {
    const [owners, decks, activeMatches] = await Promise.all([
      UserCard.count({ where: { card_id: cardId } }),
      DeckCard.count({ where: { card_id: cardId } }),
      CardInPlay.count({ where: { card_id: cardId } }),
    ]);
    return { owners, decks, activeMatches };
  }

  async deleteCard(cardId: string): Promise<boolean> {
    return sequelize.transaction(async (t) => {
      const card = await Card.findByPk(cardId, { transaction: t });
      if (!card) return false;

      await CardAbility.destroy({ where: { card_id: cardId }, transaction: t });
      await CardTranslation.destroy({ where: { card_id: cardId }, transaction: t });
      await CardKnight.destroy({ where: { card_id: cardId }, transaction: t });
      await card.destroy({ transaction: t });
      return true;
    });
  }
}
