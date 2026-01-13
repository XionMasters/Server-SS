// src/routes/cards.routes.ts
import { Router } from 'express';
import { Op } from 'sequelize';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';
import CardTranslation from '../models/CardTranslation';

const router = Router();

// Obtener todas las cartas con filtros avanzados (pública)
router.get('/', async (req, res) => {
  try {
    const {
      type,
      rarity,
      element,
      faction,
      cost_min,
      cost_max,
      power_level_min,
      power_level_max,
      tags,
      search,
      lang = 'es',
      include_stats = 'false',
      include_abilities = 'false',
      limit = '100',
      offset = '0'
    } = req.query;

    // Construir filtros
    const where: any = {};

    if (type) where.type = type;
    if (rarity) where.rarity = rarity;
    if (element) where.element = element;
    if (faction) where.faction = { [Op.iLike]: `%${faction}%` };
    
    if (cost_min || cost_max) {
      where.cost = {};
      if (cost_min) where.cost[Op.gte] = parseInt(cost_min as string);
      if (cost_max) where.cost[Op.lte] = parseInt(cost_max as string);
    }

    if (power_level_min || power_level_max) {
      where.power_level = {};
      if (power_level_min) where.power_level[Op.gte] = parseInt(power_level_min as string);
      if (power_level_max) where.power_level[Op.lte] = parseInt(power_level_max as string);
    }

    if (tags) {
      const tagArray = (tags as string).split(',');
      where.tags = { [Op.overlap]: tagArray };
    }

    if (search) {
      where.name = { [Op.iLike]: `%${search}%` };
    }

    // Construir includes
    const include: any[] = [];

    if (include_stats === 'true') {
      include.push({
        model: CardKnight,
        as: 'card_knight',
        required: false
      });
    }

    if (include_abilities === 'true') {
      include.push({
        model: CardAbility,
        as: 'card_abilities',
        required: false
      });
    }

    // Incluir traducciones si no es español
    if (lang !== 'es') {
      include.push({
        model: CardTranslation,
        as: 'translations',
        where: { language: lang },
        required: false
      });
    }

    const cards = await Card.findAll({
      where,
      include,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      order: [['name', 'ASC']]
    });

    // Mapear traducciones si existen
    const cardsWithTranslation = cards.map(card => {
      const cardJson = card.toJSON() as any;
      
      if (lang !== 'es' && cardJson.translations && cardJson.translations.length > 0) {
        const translation = cardJson.translations[0];
        cardJson.name = translation.name || cardJson.name;
        cardJson.description = translation.description || cardJson.description;
        
        // Traducir habilidades si existen
        if (cardJson.card_abilities && translation.ability_translations) {
          cardJson.card_abilities = cardJson.card_abilities.map((ability: any) => {
            const abilityTrans = translation.ability_translations[ability.id];
            if (abilityTrans) {
              return {
                ...ability,
                name: abilityTrans.name || ability.name,
                description: abilityTrans.description || ability.description
              };
            }
            return ability;
          });
        }
      }
      
      delete cardJson.translations;
      return cardJson;
    });

    res.json({
      total: cardsWithTranslation.length,
      cards: cardsWithTranslation
    });
  } catch (error) {
    console.error('Error obteniendo cartas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener carta por ID con detalles completos (pública)
router.get('/:id', async (req, res) => {
  try {
    const { lang = 'es' } = req.query;

    const include: any[] = [
      {
        model: CardKnight,
        as: 'card_knight',
        required: false
      },
      {
        model: CardAbility,
        as: 'card_abilities',
        required: false
      }
    ];

    // Incluir traducciones si no es español
    if (lang !== 'es') {
      include.push({
        model: CardTranslation,
        as: 'translations',
        where: { language: lang },
        required: false
      });
    }

    const card = await Card.findByPk(req.params.id, { include });
    
    if (!card) {
      res.status(404).json({ error: 'Carta no encontrada' });
      return;
    }

    const cardJson = card.toJSON() as any;

    // Aplicar traducción si existe
    if (lang !== 'es' && cardJson.translations && cardJson.translations.length > 0) {
      const translation = cardJson.translations[0];
      cardJson.name = translation.name || cardJson.name;
      cardJson.description = translation.description || cardJson.description;
      
      // Traducir habilidades
      if (cardJson.card_abilities && translation.ability_translations) {
        cardJson.card_abilities = cardJson.card_abilities.map((ability: any) => {
          const abilityTrans = translation.ability_translations[ability.id];
          if (abilityTrans) {
            return {
              ...ability,
              name: abilityTrans.name || ability.name,
              description: abilityTrans.description || ability.description
            };
          }
          return ability;
        });
      }
    }

    delete cardJson.translations;
    res.json(cardJson);
  } catch (error) {
    console.error('Error obteniendo carta:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de cartas (pública)
router.get('/stats/summary', async (req, res) => {
  try {
    const totalCards = await Card.count();
    
    const byType = await Card.findAll({
      attributes: [
        'type',
        [Card.sequelize!.fn('COUNT', Card.sequelize!.col('type')), 'count']
      ],
      group: ['type']
    });

    const byRarity = await Card.findAll({
      attributes: [
        'rarity',
        [Card.sequelize!.fn('COUNT', Card.sequelize!.col('rarity')), 'count']
      ],
      group: ['rarity']
    });

    const byElement = await Card.findAll({
      attributes: [
        'element',
        [Card.sequelize!.fn('COUNT', Card.sequelize!.col('element')), 'count']
      ],
      group: ['element']
    });

    res.json({
      total: totalCards,
      by_type: byType,
      by_rarity: byRarity,
      by_element: byElement
    });
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;