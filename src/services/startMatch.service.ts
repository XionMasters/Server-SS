// src/services/startMatch.service.ts
/**
 * TestMatchService - Servicio dedicado para partidas TEST
 * 
 * Responsabilidades:
 * - Verificar si usuario tiene partida TEST activa
 * - Validar mazo del usuario
 * - Crear partida TEST
 * - Inicializar cartas y estado
 * - Rate limiting por usuario
 */

import User from '../models/User';
import Deck from '../models/Deck';
import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';
import Card from '../models/Card';
import DeckCard from '../models/DeckCard';
import { GameService } from './game.service';
import { Op } from 'sequelize';
import { MatchMode } from '../game/rules/types';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';
import { CardManager } from './game/cardManager';
import { GameStateBuilder } from './game/GameStateBuilder ';

// Rate limiting: {userId: lastCreatedAt}
const testMatchRateLimits = new Map<string, number>();
const RATE_LIMIT_MS = 5000; // 5 segundos entre partidas TEST

export class StartMatchService {
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
      const match = await this._createNewMatchState(userId1, deck1, userId2, deck2);

      // 6️⃣ Inicializar cartas
      // 6️⃣ Inicializar cartas (una sola API mental)
      await CardManager.createCardsInPlay(match.id, deck1.deckCards, 1, BASE_MATCH_RULES);
      await CardManager.createCardsInPlay(match.id, deck2.deckCards, 2, BASE_MATCH_RULES);

      // 6️⃣b Distribuir mano inicial (5 cartas a hand, resto a deck)
      await CardManager.drawInitialHands(match.id);

      // 7️⃣ Construir estado inicial
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
  private static async _getAndValidateActiveDeck(userId: string): Promise<any> {
    const activeDeck = await Deck.findOne({
      where: { user_id: userId, is_active: true },
      include: [{ association: 'deckCards' }]
    });

    if (!activeDeck) {
      throw new Error('No tienes un mazo activo. Marca un mazo como activo primero.');
    }

    // Validar que el mazo cumpla con las reglas básicas
    const cardCount = (activeDeck as any).deckCards?.length || 0;

    if (cardCount < 40) {
      throw new Error(
        `Tu mazo activo solo tiene ${cardCount} cartas. Necesita mínimo 40 cartas para jugar.`
      );
    }

    if (cardCount > 100) {
      throw new Error(
        `Tu mazo activo tiene ${cardCount} cartas. El máximo permitido es 100.`
      );
    }

    console.log(`✅ Mazo validado: ${activeDeck.name} (${cardCount} cartas)`);
    return activeDeck;
  }

  /**
   * Crea el registro de Match en BD
   */
  private static async _createNewMatchState(userId1: string, userId2: string, deck1: any, deck2: any): Promise<any> {
    const newMatch = await Match.create({
      player1_id: userId1,
      player2_id: userId2,
      player1_deck_id: deck1.id,
      player2_deck_id: deck2.id,
      phase: 'starting',
      current_turn: 1,
      //Random para definir que jugador inicia primero
      current_player: Math.random() < 0.5 ? 1 : 2,
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
      const gameState = await GameStateBuilder.buildFromMatch(activeMatch, {
        perspectivePlayer: 1 // en TEST el cliente siempre es player 1
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
