import { Op, fn, col } from 'sequelize';
import { validate as isUuid } from 'uuid';
import UserProfile from '../../infrastructure/database/models/UserProfile';
import ProfileAvatar from '../../infrastructure/database/models/ProfileAvatar';
import UserAvatarUnlock from '../../infrastructure/database/models/UserAvatarUnlock';
import DeckBack from '../../infrastructure/database/models/DeckBack';
import UserDeckBackUnlock from '../../infrastructure/database/models/UserDeckBackUnlock';
import Card from '../../infrastructure/database/models/Card';
import UserCard from '../../infrastructure/database/models/UserCard';
import Deck from '../../infrastructure/database/models/Deck';
import Match from '../../infrastructure/database/models/Match';
import User from '../../infrastructure/database/models/User';
import { buildRecentMatches, computeMatchStats, FinishedMatchRow } from './profile-stats';

const avatarImageUrl = (avatarId: string) => `/profile/avatar/${avatarId}/image`;

export class ProfileService {
  static async getProfile(userId: string) {
    const profile = await this.ensureProfile(userId);

    let avatar = null;
    if (profile?.avatar_image_id) {
      const avatarRecord = await ProfileAvatar.findByPk(profile.avatar_image_id);
      if (avatarRecord) {
        avatar = {
          ...avatarRecord.toJSON(),
          image_url: avatarImageUrl(avatarRecord.id),
        };
      }
    }

    const [user, matchRows, collection, activeDeck, deckCount] = await Promise.all([
      User.findByPk(userId, { attributes: ['username', 'created_at'] }),
      this.getFinishedMatches(userId),
      this.getCollectionStats(userId),
      Deck.findOne({
        where: { user_id: userId, is_active: true },
        include: [{ model: DeckBack, as: 'deck_back', required: false }],
      }),
      Deck.count({ where: { user_id: userId } }),
    ]);

    const deckBack = (activeDeck as any)?.deck_back;

    return {
      profile: {
        ...(profile?.toJSON() || {}),
        avatar,
      },
      user: {
        username: user?.username ?? null,
        member_since: user?.created_at ?? null,
      },
      stats: computeMatchStats(matchRows, userId),
      recent_matches: buildRecentMatches(matchRows, userId),
      collection: {
        ...collection,
        decks: deckCount,
      },
      active_deck: activeDeck
        ? {
          id: activeDeck.id,
          name: activeDeck.name,
          deck_back: deckBack
            ? { id: deckBack.id, name: deckBack.name, image_url: deckBack.image_url }
            : null,
        }
        : null,
      message: 'Perfil obtenido correctamente',
    };
  }

  static async getAvailableAvatars(userId: string) {
    const unlockedAvatars = await UserAvatarUnlock.findAll({
      where: { user_id: userId },
    });
    const unlockedIds = unlockedAvatars.map((avatar) => avatar.avatar_id);
    const allAvatars = await ProfileAvatar.findAll({
      where: { is_active: true },
      order: [['unlock_type', 'ASC'], ['name', 'ASC']],
    });

    // Nombre de la carta que desbloquea cada avatar bloqueado (el cliente lo muestra)
    const requiredCardIds = allAvatars
      .map((avatar) => avatar.required_card_id)
      .filter((id): id is string => Boolean(id));
    const requiredCards = requiredCardIds.length > 0
      ? await Card.findAll({ where: { id: requiredCardIds }, attributes: ['id', 'name', 'rarity'] })
      : [];
    const cardsById = new Map(requiredCards.map((card) => [card.id, card]));

    return {
      avatars: allAvatars.map((avatar) => {
        const card = avatar.required_card_id ? cardsById.get(avatar.required_card_id) : undefined;
        return {
          ...avatar.toJSON(),
          is_unlocked: unlockedIds.includes(avatar.id),
          image_url: avatarImageUrl(avatar.id),
          required_card: card ? { id: card.id, name: card.name, rarity: card.rarity } : null,
        };
      }),
      message: 'Avatares disponibles obtenidos',
    };
  }

  static async updateAvatar(userId: string, avatarId: string) {
    if (!avatarId || !isUuid(avatarId)) {
      throw new ProfileServiceError(400, 'avatar_id es requerido');
    }

    const avatar = await ProfileAvatar.findOne({ where: { id: avatarId, is_active: true } });
    if (!avatar) {
      throw new ProfileServiceError(404, 'Avatar no encontrado o inactivo');
    }

    const unlocked = await UserAvatarUnlock.findOne({
      where: { user_id: userId, avatar_id: avatarId },
    });
    if (!unlocked) {
      throw new ProfileServiceError(403, 'No tienes desbloqueado este avatar');
    }

    const [profile, created] = await UserProfile.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId, avatar_image_id: avatarId },
    });

    if (!created) {
      await profile.update({ avatar_image_id: avatarId });
    }

    return {
      profile,
      avatar: { id: avatar.id, name: avatar.name, image_url: avatarImageUrl(avatar.id) },
      message: 'Avatar actualizado correctamente',
    };
  }

  static async checkCardUnlocks(userId: string) {
    // Las rarezas de las cartas están en inglés ('legendary'); antes se buscaba
    // 'legendaria' y nunca se desbloqueaba ningún avatar.
    const userLegendaryCards = await UserCard.findAll({
      where: { user_id: userId, quantity: { [Op.gt]: 0 } },
      include: [{
        model: Card,
        as: 'card',
        where: { rarity: ['legendary', 'divine'] },
      }],
    });
    const legendaryCardIds = userLegendaryCards.map((card) => card.card_id);
    if (legendaryCardIds.length === 0) {
      return { new_unlocks: [], message: 'No hay nuevos avatares para desbloquear' };
    }

    const avatarsToUnlock = await ProfileAvatar.findAll({
      where: {
        unlock_type: 'card_unlock',
        required_card_id: legendaryCardIds,
        is_active: true,
      },
    });

    const newUnlocks = [];
    for (const avatar of avatarsToUnlock) {
      const [unlock, created] = await UserAvatarUnlock.findOrCreate({
        where: { user_id: userId, avatar_id: avatar.id },
        defaults: {
          user_id: userId,
          avatar_id: avatar.id,
          unlock_source: 'card_legendary_obtained',
        },
      });
      if (created) {
        newUnlocks.push({
          avatar: { id: avatar.id, name: avatar.name, image_url: avatarImageUrl(avatar.id) },
          unlock,
        });
      }
    }

    return {
      new_unlocks: newUnlocks,
      message: newUnlocks.length > 0
        ? `¡${newUnlocks.length} nuevo(s) avatar(es) desbloqueado(s)!`
        : 'No hay nuevos avatares para desbloquear',
    };
  }

  /**
   * Perfil público (no requiere sesión). Solo lectura: antes creaba perfiles y
   * desbloqueos en la BD para cualquier id que se pidiera.
   */
  static async getPublicProfile(userId: string) {
    if (!isUuid(userId)) {
      throw new ProfileServiceError(404, 'Usuario no encontrado');
    }

    const profile = await UserProfile.findOne({ where: { user_id: userId } });
    const avatarRecord = profile?.avatar_image_id
      ? await ProfileAvatar.findByPk(profile.avatar_image_id)
      : await ProfileAvatar.findOne({ where: { unlock_type: 'default', is_active: true } });

    const avatar = avatarRecord
      ? { id: avatarRecord.id, name: avatarRecord.name, image_url: avatarImageUrl(avatarRecord.id) }
      : null;

    let deckBack = null;
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true },
    });

    if (activeDeck?.current_deck_back_id) {
      const deckBackRecord = await DeckBack.findByPk(activeDeck.current_deck_back_id);
      if (deckBackRecord) {
        deckBack = {
          id: deckBackRecord.id,
          name: deckBackRecord.name,
          image_url: deckBackRecord.image_url,
        };
      }
    }

    if (!deckBack) {
      const defaultDeckBack = await DeckBack.findOne({
        where: { unlock_type: 'default', is_active: true },
      });
      if (defaultDeckBack) {
        deckBack = {
          id: defaultDeckBack.id,
          name: defaultDeckBack.name,
          image_url: defaultDeckBack.image_url,
        };
      }
    }

    return {
      avatar,
      deck_back: deckBack,
      message: 'Perfil obtenido correctamente',
    };
  }

  static async getAvailableDeckBacks(userId: string) {
    const unlockedDeckBacks = await UserDeckBackUnlock.findAll({
      where: { user_id: userId },
    });
    const unlockedIds = unlockedDeckBacks.map((deckBack) => deckBack.deck_back_id);
    const allDeckBacks = await DeckBack.findAll({
      where: { is_active: true },
      order: [['unlock_type', 'ASC'], ['name', 'ASC']],
      raw: true,
    });

    return allDeckBacks.map((deckBack: any) => ({
      ...deckBack,
      is_unlocked: unlockedIds.includes(deckBack.id),
    }));
  }

  static async updateDeckBack(userId: string, deckId: string, deckBackId: string) {
    if (!deckId || !deckBackId || !isUuid(deckId) || !isUuid(deckBackId)) {
      throw new ProfileServiceError(400, 'deck_id y deck_back_id son requeridos');
    }

    const deck = await Deck.findOne({
      where: { id: deckId, user_id: userId },
    });
    if (!deck) {
      throw new ProfileServiceError(404, 'Baraja no encontrada');
    }

    const deckBack = await DeckBack.findOne({
      where: { id: deckBackId, is_active: true },
    });
    if (!deckBack) {
      throw new ProfileServiceError(404, 'Dorso no encontrado o inactivo');
    }

    const unlock = await UserDeckBackUnlock.findOne({
      where: { user_id: userId, deck_back_id: deckBackId },
    });
    if (!unlock) {
      throw new ProfileServiceError(403, 'No tienes acceso a este dorso');
    }

    deck.current_deck_back_id = deckBackId;
    await deck.save();

    return {
      success: true,
      message: 'Dorso de la baraja actualizado correctamente',
      current_deck_back_id: deckBackId,
      deck_back: { id: deckBack.id, name: deckBack.name, image_url: deckBack.image_url },
    };
  }

  /** Crea el perfil con el avatar por defecto la primera vez que el usuario lo abre. */
  private static async ensureProfile(userId: string): Promise<UserProfile | null> {
    const existing = await UserProfile.findOne({ where: { user_id: userId } });
    if (existing) return existing;

    const defaultAvatar = await ProfileAvatar.findOne({
      where: { unlock_type: 'default', is_active: true },
    });
    if (!defaultAvatar) return null;

    const [profile] = await UserProfile.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId, avatar_image_id: defaultAvatar.id },
    });
    await UserAvatarUnlock.findOrCreate({
      where: { user_id: userId, avatar_id: defaultAvatar.id },
      defaults: { user_id: userId, avatar_id: defaultAvatar.id, unlock_source: 'initial_setup' },
    });
    return profile;
  }

  private static async getFinishedMatches(userId: string): Promise<FinishedMatchRow[]> {
    const matches = await Match.findAll({
      where: {
        phase: 'finished',
        [Op.or]: [{ player1_id: userId }, { player2_id: userId }],
      },
      attributes: ['id', 'player1_id', 'player2_id', 'winner_id', 'finished_at'],
      include: [
        { model: User, as: 'player1', attributes: ['username'] },
        { model: User, as: 'player2', attributes: ['username'] },
      ],
    });

    return matches.map((match: any) => ({
      id: match.id,
      player1_id: match.player1_id,
      player2_id: match.player2_id,
      winner_id: match.winner_id ?? null,
      finished_at: match.finished_at ?? null,
      player1_name: match.player1?.username ?? null,
      player2_name: match.player2?.username ?? null,
    }));
  }

  private static async getCollectionStats(userId: string) {
    const [owned, totalCards] = await Promise.all([
      UserCard.findOne({
        where: { user_id: userId, quantity: { [Op.gt]: 0 } },
        attributes: [
          [fn('COUNT', fn('DISTINCT', col('card_id'))), 'unique_cards'],
          [fn('COALESCE', fn('SUM', col('quantity')), 0), 'total_copies'],
        ],
        raw: true,
      }) as Promise<any>,
      Card.count(),
    ]);

    return {
      unique_cards: Number(owned?.unique_cards ?? 0),
      total_copies: Number(owned?.total_copies ?? 0),
      catalog_size: totalCards,
    };
  }
}

export class ProfileServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProfileServiceError';
  }
}
