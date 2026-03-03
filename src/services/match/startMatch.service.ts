// src/services/match/startMatch.service.ts
/**
 * StartMatchService - Servicio dedicado para iniciar partidas, cualquier tipo.
 * 
 * Responsabilidades:
 * - Verificar si usuario tiene partida activa
 * - Validar mazo del usuario
 * - Crear partida
 * - Inicializar cartas y estado
 * - Rate limiting por usuario
 */

import User from '../../models/User';
import Match from '../../models/Match';
import Deck from '../../models/Deck';
import Card from '../../models/Card';
import CardInPlay from '../../models/CardInPlay';
import { Op } from 'sequelize';
import { MatchMode } from '../../game/rules/types';
import { BASE_MATCH_RULES } from '../../game/rules/base.rules';
import { GameStateBuilder } from '../game/GameStateBuilder';
import { DeckService } from '../deck.service';
import { MatchSetupService } from '../matchSetup.service';
import { serializeCardInPlay } from '../serializers/cardInPlay.serializer';

// Rate limiting: {userId: lastCreatedAt}
const testMatchRateLimits = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // 5 segundos entre partidas TEST

export class StartMatchService {
  /**
   * Crea partida en espera (cola matchmaking)
   */
  static async createWaitingMatch(userId: string): Promise<Match> {
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true }
    });

    if (!activeDeck) {
      throw new Error('No tienes un deck activo. Activa uno primero.');
    }

    const newMatch = await Match.create({
      player1_id: userId,
      player1_deck_id: activeDeck.id,
      player2_id: null as any,
      player2_deck_id: null as any,
      phase: 'waiting',
      player1_life: 12,
      player2_life: 12,
      player1_cosmos: 0,
      player2_cosmos: 0,
      current_turn: 1,
      current_player: 1
    });

    console.log(`⏳ Nueva partida en espera creada: ${newMatch.id}`);
    return newMatch;
  }

  /**
   * Completa una partida encontrada en cola e inicializa estado de juego.
   */
  static async startWaitingMatch(waitingMatch: Match, player2Id: string): Promise<any> {
    const player2Deck = await Deck.findOne({
      where: { user_id: player2Id, is_active: true }
    });

    if (!player2Deck) {
      throw new Error('No tienes un deck activo. Activa uno primero.');
    }

    waitingMatch.player2_id = player2Id;
    waitingMatch.player2_deck_id = player2Deck.id;
    waitingMatch.phase = 'starting';
    await waitingMatch.save();

    await MatchSetupService.initializeMatchCards(
      waitingMatch,
      waitingMatch.player1_deck_id,
      player2Deck.id,
      7
    );

    const firstPlayer = waitingMatch.current_player;
    waitingMatch.phase = firstPlayer === 1 ? 'player1_turn' : 'player2_turn';

    if (firstPlayer === 1) {
      waitingMatch.player1_cosmos = Math.min((waitingMatch.player1_cosmos ?? 0) + 1, 12);
    } else {
      waitingMatch.player2_cosmos = Math.min((waitingMatch.player2_cosmos ?? 0) + 1, 12);
    }
    await waitingMatch.save();

    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id: waitingMatch.id },
      include: [
        {
          model: Card,
          as: 'card',
          attributes: ['id', 'name', 'type', 'rarity', 'cost', 'generate', 'image_url', 'description', 'faction', 'element'],
          include: [
            {
              model: (await import('../../models/CardKnight')).default,
              as: 'card_knight',
              attributes: ['attack', 'defense', 'health', 'cosmos', 'can_defend', 'defense_reduction'],
              required: false
            }
          ]
        }
      ]
    });

    const cardsData = cardsInPlay.map(serializeCardInPlay);
    const player1HandCount = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'hand').length;
    const player2HandCount = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'hand').length;
    const player1DeckSize = cardsInPlay.filter(c => c.player_number === 1 && c.zone === 'deck').length;
    const player2DeckSize = cardsInPlay.filter(c => c.player_number === 2 && c.zone === 'deck').length;

    const player1 = await User.findByPk(waitingMatch.player1_id, { attributes: ['id', 'username'] });
    const player2 = await User.findByPk(player2Id, { attributes: ['id', 'username'] });

    return {
      match_id: waitingMatch.id,
      player1: {
        id: waitingMatch.player1_id,
        username: (player1 as any)?.username
      },
      player2: {
        id: player2Id,
        username: (player2 as any)?.username
      },
      phase: waitingMatch.phase,
      current_turn: waitingMatch.current_turn,
      current_player: waitingMatch.current_player,
      player1_cosmos: waitingMatch.player1_cosmos,
      player2_cosmos: waitingMatch.player2_cosmos,
      player1_hand_count: player1HandCount,
      player2_hand_count: player2HandCount,
      player1_deck_size: player1DeckSize,
      player2_deck_size: player2DeckSize,
      cards_in_play: cardsData
    };
  }

  /**
   * Crear una partida para los usuarios
   * - Verifica que no tenga partida activa
   * - Verifica rate limit
   * - Valida mazo
   * - Crea partida
   * - Inicializa cartas
   * - Retorna estado inicial para el cliente
   */
  static async createNewMatch(userId1: string, userId2: string, mode: MatchMode): Promise<{
    match_id: string;
    game_state: any;
  }> {
    try {

      // 1️⃣ Usuarios
      const [user1, user2] = await Promise.all([
        User.findByPk(userId1),
        User.findByPk(userId2)
      ]);

      if (!user1 || !user2) {
        throw new Error('Uno o ambos usuarios no encontrados');
      }

      // 2️⃣ Verificar partida activa
      await this._verifyActiveMatch(userId1, userId2);

      // 3️⃣ Rate limit
      this._verifyRateLimit(userId1);
      this._verifyRateLimit(userId2);

      // 4️⃣ Obtener mazos
      const deck1 = await this._getAndValidateActiveDeck(userId1);
      const deck2 = await this._getAndValidateActiveDeck(userId2);

      // 5️⃣ Crear partida TEST
      const match = await this._createNewMatchState(userId1, userId2, deck1.deck, deck2.deck, mode === 'TEST');

      // 6️⃣ Inicializar cartas usando MatchSetupService
      const initialHandSize = mode === 'TEST' ? 5 : BASE_MATCH_RULES.initial_hand_size;
      await MatchSetupService.initializeMatchCards(match, deck1.deck.id, deck2.deck.id, initialHandSize);

      // 7️⃣ Construir estado inicial
      const gameState = await GameStateBuilder.buildFromMatch(match, { perspectivePlayer: mode === 'TEST' ? 1 : undefined });

      // 8️⃣ Registrar tiempo de creación (rate limit)
      testMatchRateLimits.set(userId1, Date.now());
      testMatchRateLimits.set(userId2, Date.now());

      console.log(`✅ TestMatch creada exitosamente: ${match.id}`);

      return {
        match_id: match.id,
        game_state: gameState
      };
    } catch (error: any) {
      console.error('❌ Error en TestMatchService.createTestMatch:', error.message);
      throw error;
    }
  }

  /**
   * Verifica que el usuario NO tenga una partida TEST activa
   */
  private static async _verifyActiveMatch(userId1: string, userId2: string): Promise<void> {
    console.log(`🔍 Verificando partidas TEST activas para usuarios: ${userId1}, ${userId2}`);

    const activeMatch = await Match.findOne({
      where: {
        player1_id: userId1,
        player2_id: userId2, // TEST match: ambos jugadores son iguales
        phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] } // Fases ACTIVAS (sin finished)
      }
    });

    if (activeMatch) {
      console.error(`❌ ENCONTRADA partida TEST activa:`);
      console.error(`   ID: ${activeMatch.id}`);
      console.error(`   Fase: ${activeMatch.phase}`);
      console.error(`   Creada: ${activeMatch.created_at}`);
      console.error(`   Finalizada: ${activeMatch.finished_at}`);
      throw new Error(
        `Ya tienes una partida TEST activa en curso (ID: ${activeMatch.id}). ` +
        `Finaliza o abandona la partida antes de crear una nueva.`
      );
    }

    console.log(`✅ Usuarios ${userId1}, ${userId2} NO tienen partida TEST activa`);
  }

  /**
   * Verifica rate limit: máximo 1 partida TEST cada 5 segundos
   */
  private static _verifyRateLimit(userId: string): void {
    const lastCreatedAt = testMatchRateLimits.get(userId);

    if (lastCreatedAt) {
      const timeSinceLastCreation = Date.now() - lastCreatedAt;

      if (timeSinceLastCreation < RATE_LIMIT_MS) {
        const waitMs = RATE_LIMIT_MS - timeSinceLastCreation;
        throw new Error(
          `Debes esperar ${Math.ceil(waitMs / 1000)} segundos antes de crear otra partida TEST. ` +
          `Evita spammear creación de partidas.`
        );
      }
    }

    console.log(`✅ Rate limit OK para usuario ${userId}`);
  }

  /**
   * Obtiene mazo activo y valida que cumpla reglas
   */
  private static async _getAndValidateActiveDeck(userId: string) {
    const result = await DeckService.getAndValidateActiveDeck(
      userId,
      BASE_MATCH_RULES.deck.min_cards,
      BASE_MATCH_RULES.deck.max_cards
    );

    console.log(`✅ Mazo validado: ${result.deck.name} (${result.totalCards} cartas)`);
    return result;
  }

  /**
   * Crea el registro de Match en BD
   */
  private static async _createNewMatchState(userId1: string, userId2: string, deck1: any, deck2: any, isTest: boolean): Promise<any> {
    const newMatch = await Match.create({
      player1_id: userId1,
      player2_id: userId2,
      player1_deck_id: deck1.id,
      player2_deck_id: deck2.id,
      phase: 'starting',
      current_turn: 1,
      //Random para definir que jugador inicia primero
      current_player: isTest ? 1 : Math.random() < 0.5 ? 1 : 2,
      player1_life: BASE_MATCH_RULES.initial_life,
      player2_life: BASE_MATCH_RULES.initial_life,
      player1_cosmos: BASE_MATCH_RULES.initial_cosmos,
      player2_cosmos: BASE_MATCH_RULES.initial_cosmos,
      started_at: new Date()
    });

    console.log(`🎭 Nueva Match creada: ${newMatch.id}`);
    return newMatch;
  }

  /**
   * Reanuda una partida TEST existente (en lugar de crear una nueva)
   */
  /**
 * Reanuda una partida TEST existente
 */
  static async resumeTestMatch(userId: string): Promise<{
    match_id: string;
    game_state: any;
  }> {
    try {
      // 1️⃣ Buscar partida TEST activa
      const activeMatch = await Match.findOne({
        where: {
          player1_id: userId,
          player2_id: userId,
          phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] }
        }
      });

      if (!activeMatch) {
        throw new Error('No tienes una partida TEST activa para reanudar');
      }

      // 2️⃣ Construir estado desde la BD
      // Usar la perspectiva del jugador activo (quien tiene el turno)
      const perspectivePlayer = activeMatch.phase === 'player2_turn' ? 2 : 1;
      const gameState = await GameStateBuilder.buildFromMatch(activeMatch, {
        perspectivePlayer
      });

      console.log(`✅ TestMatch reanudada exitosamente: ${activeMatch.id}`);

      return {
        match_id: activeMatch.id,
        game_state: gameState
      };
    } catch (error: any) {
      console.error('❌ Error en StartMatchService.resumeTestMatch:', error.message);
      throw error;
    }
  }

}
