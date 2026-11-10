// src/app/matches/ai/aiOpponent.service.ts
// Prepara al rival IA y crea partidas Jugador vs IA.
//
// - Usuario de sistema con id fijo (aiBot.ts), email verificado y contraseña aleatoria
//   que nadie conoce: no se puede iniciar sesión con él.
// - Un mazo por facción ("IA · <facción>"), generado con randomDeckBuilder la primera vez
//   y reutilizado después (se regenera si deja de ser válido, p. ej. tras cambiar el catálogo).
//   La IA no necesita tener las cartas en su colección: el reparto lee el mazo directamente.

import bcrypt from 'bcryptjs';
import { randomBytes, randomInt } from 'crypto';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import User from '../../../infrastructure/database/models/User';
import Deck from '../../../infrastructure/database/models/Deck';
import DeckCard from '../../../infrastructure/database/models/DeckCard';
import { buildRandomDeck, type CatalogCard } from '../../decks/randomDeckBuilder';
import { validateDeck } from '../../decks/deckValidator';
import { StartMatchService } from '../lifecycle/startMatch.service';
import { AI_BOT_EMAIL, AI_BOT_USER_ID, AI_BOT_USERNAME } from './aiBot';

const DECK_NAME_PREFIX = 'IA · ';

async function loadCatalog(): Promise<CatalogCard[]> {
  return sequelize.query<CatalogCard>(
    `SELECT c.id, c.code, c.name, c.type, c.faction, c.rarity, c.max_copies, c."unique", c.tags,
            ct.compatible_tags
       FROM cards c
       LEFT JOIN card_techniques ct ON ct.card_id = c.id`,
    { type: QueryTypes.SELECT },
  );
}

export class AiOpponentService {
  /** Crea (si falta) el usuario de sistema de la IA. */
  static async ensureBotUser(): Promise<User> {
    const existing = await User.findByPk(AI_BOT_USER_ID);
    if (existing) return existing;

    const password_hash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const base = { id: AI_BOT_USER_ID, email: AI_BOT_EMAIL, password_hash, is_email_verified: true, currency: 0 };
    try {
      return await User.create({ ...base, username: AI_BOT_USERNAME } as any);
    } catch (error: any) {
      // Otro proceso la creó a la vez, o un jugador ya usa ese nombre
      const raced = await User.findByPk(AI_BOT_USER_ID);
      if (raced) return raced;
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      return User.create({ ...base, username: `${AI_BOT_USERNAME} ${AI_BOT_USER_ID.slice(-4)}` } as any);
    }
  }

  /**
   * Mazo de la IA para una facción (al azar entre las jugables si no se indica).
   * Devuelve el id del mazo, listo para repartir.
   */
  static async ensureBotDeck(faction?: string): Promise<{ deckId: string; faction: string }> {
    const catalog = await loadCatalog();
    // Facción elegida al azar aquí (buildRandomDeck valida que sea jugable)
    const generated = buildRandomDeck(catalog, { faction, rng: () => randomInt(0, 1_000_000) / 1_000_000 });
    const deckName = `${DECK_NAME_PREFIX}${generated.faction}`;

    const existing = await Deck.findOne({ where: { user_id: AI_BOT_USER_ID, name: deckName } });
    if (existing) {
      const cards = await DeckCard.findAll({ where: { deck_id: existing.id } });
      const validation = await validateDeck(cards.map(c => ({ card_id: c.card_id, quantity: c.quantity })));
      if (validation.valid) return { deckId: existing.id, faction: generated.faction };
      await sequelize.transaction(async (transaction) => {
        await DeckCard.destroy({ where: { deck_id: existing.id }, transaction });
        await DeckCard.bulkCreate(
          generated.cards.map(({ card_id, quantity }) => ({ deck_id: existing.id, card_id, quantity })),
          { transaction },
        );
      });
      return { deckId: existing.id, faction: generated.faction };
    }

    const validation = await validateDeck(generated.cards);
    if (!validation.valid) {
      throw new Error(`El mazo generado para la IA no es válido: ${validation.errors.join('; ')}`);
    }

    const deck = await sequelize.transaction(async (transaction) => {
      const created = await Deck.create({
        user_id: AI_BOT_USER_ID,
        name: deckName,
        description: `Mazo de la IA (${generated.faction}).`,
        is_active: false,
      } as any, { transaction });
      await DeckCard.bulkCreate(
        generated.cards.map(({ card_id, quantity }) => ({ deck_id: created.id, card_id, quantity })),
        { transaction },
      );
      return created;
    });
    return { deckId: deck.id, faction: generated.faction };
  }

  /**
   * Crea una partida del usuario contra la IA. El usuario es el jugador 1; quién empieza es al azar.
   * Devuelve el mismo payload que match_found en PvP (más la facción de la IA).
   */
  static async createAiMatch(userId: string, faction?: string): Promise<any> {
    await this.ensureBotUser();
    const botDeck = await this.ensureBotDeck(faction);
    const data = await StartMatchService.startDirectMatch(userId, AI_BOT_USER_ID, botDeck.deckId);
    console.log(`🤖 Partida contra la IA creada: ${data.match_id} (IA con ${botDeck.faction})`);
    return { ...data, vs_ai: true, ai_faction: botDeck.faction };
  }
}
