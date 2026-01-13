// src/services/game.service.ts
/**
 * GameService - Orquestador central de lógica de juego
 * 
 * Este es el árbitro real. Todas las decisiones importantes
 * pasan por aquí. Los controladores solo llaman a estos métodos.
 */

import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';
import DeckCard from '../models/DeckCard';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import MatchAction from '../models/MatchAction';
import { TurnManager } from './game/turnManager';
import { CardManager } from './game/cardManager';
import { AttackManager } from './game/attackManager';
import { TurnValidation } from './validation/turnValidation';
import { EnergyValidation } from './validation/energyValidation';
import { PlayValidation } from './validation/playValidation';
import { SlotValidation } from './validation/slotValidation';
import { AttackValidation } from './validation/attackValidation';

export class GameService {
  /**
   * Inicia el turno de un jugador
   * - Da cosmos
   * - Roba carta
   * - Resetea flags
   * - Ejecuta efectos on_turn_start
   */
  static async startTurn(matchId: string, playerNumber: number): Promise<Match | null> {
    try {
      const match = await Match.findByPk(matchId);
      TurnValidation.assertMatchActive(match);

      await TurnManager.startTurn(matchId, playerNumber);

      return await Match.findByPk(matchId);
    } catch (error: any) {
      console.error(`❌ Error en startTurn:`, error.message);
      throw error;
    }
  }

  /**
   * Juega una carta desde la mano al campo
   * - Valida turno
   * - Valida energía
   * - Valida slot disponible
   * - Consume cosmos
   * - Ejecuta efectos de la carta
   */
  static async playCard(
    matchId: string,
    userId: string,
    cardInPlayId: string,
    position: number
  ): Promise<any> {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) {
        throw new Error('Partida no encontrada');
      }

      TurnValidation.assertMatchActive(match);

      const playerNumber = TurnValidation.assertPlayerInMatch(match, userId);
      const isTestMatch = TurnValidation.isTestMatch(match);

      TurnValidation.assertIsPlayerTurn(match, playerNumber, isTestMatch);

      // Obtener la carta
      const cardInPlay = await PlayValidation.assertCardInHand(
        matchId,
        userId,
        cardInPlayId,
        playerNumber
      );

      const card = (cardInPlay as any).card;
      PlayValidation.assertValidCardType(card);

      // Validar energía
      const currentCosmos = EnergyValidation.getCurrentCosmos(match, playerNumber);
      EnergyValidation.assertEnoughCosmos(currentCosmos, card.cost);

      // Jugar carta
      await CardManager.playCard(match, cardInPlayId, playerNumber, position);
      EnergyValidation.consumeCosmos(match, playerNumber, card.cost);

      // Guardar cambios
      await match.save();

      // Registrar acción
      await MatchAction.create({
        match_id: matchId,
        player_id: userId,
        turn_number: match.current_turn,
        action_type: 'play_card',
        action_data: JSON.stringify({
          card_id: card.id,
          position,
          cost: card.cost
        })
      });

      console.log(`✅ Carta jugada exitosamente: ${card.name}`);

      return {
        success: true,
        cardInPlay,
        remainingCosmos: EnergyValidation.getCurrentCosmos(match, playerNumber)
      };
    } catch (error: any) {
      console.error(`❌ Error jugando carta:`, error.message);
      throw error;
    }
  }

  /**
   * Pasa el turno al siguiente jugador
   * - Cambia turno
   * - Ejecuta start_turn para el siguiente
   * - Registra acción
   */
  static async passTurn(matchId: string, userId: string): Promise<Match | null> {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) {
        throw new Error('Partida no encontrada');
      }

      TurnValidation.assertMatchActive(match);

      const playerNumber = TurnValidation.assertPlayerInMatch(match, userId);
      const isTestMatch = TurnValidation.isTestMatch(match);

      TurnValidation.assertIsPlayerTurn(match, playerNumber, isTestMatch);

      // Pasar turno
      const nextPlayer = await TurnManager.passTurn(match, userId);

      // Iniciar turno del siguiente jugador
      await this.startTurn(matchId, parseInt(nextPlayer));

      // Registrar acción
      await MatchAction.create({
        match_id: matchId,
        player_id: userId,
        turn_number: match.current_turn,
        action_type: 'pass_turn',
        action_data: '{}'
      });

      const updatedMatch = await Match.findByPk(matchId);
      console.log(`✅ Turno pasado exitosamente`);

      return updatedMatch;
    } catch (error: any) {
      console.error(`❌ Error pasando turno:`, error.message);
      throw error;
    }
  }

  /**
   * Inicializa una partida nueva
   * - Crea cartas en juego
   * - Distribuye mano inicial
   * - Determina jugador inicial
   * - NO inicia el turno (cliente lo hará cuando esté listo)
   */
  static async initializeMatch(matchId: string): Promise<void> {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) throw new Error('Match no encontrado');

      // Obtener cartas de los mazos
      const deck1Cards = await DeckCard.findAll({
        where: { deck_id: match.player1_deck_id }
      });

      const deck2Cards = match.player2_deck_id
        ? await DeckCard.findAll({ where: { deck_id: match.player2_deck_id } })
        : [];

      // Crear cartas en juego
      await CardManager.createCardsInPlay(matchId, deck1Cards, deck2Cards);

      // Repartir mano inicial (5 cartas cada uno)
      await CardManager.drawInitialHands(matchId);

      // Determinar jugador inicial
      match.current_player = Math.random() < 0.5 ? 1 : 2;
      match.phase = match.current_player === 1 ? 'player1_turn' : 'player2_turn';
      await match.save();

      // ✅ NOT starting turn - client will notify when ready
      console.log(`✅ Match inicializado. Jugador inicial: ${match.current_player}. Esperando confirmación del cliente...`);
    } catch (error: any) {
      console.error(`❌ Error inicializando match:`, error.message);
      throw error;
    }
  }

  /**
   * Inicia el primer turno cuando el cliente está listo
   * El cliente llama esto después de cargar el tablero completamente
   * - Ejecuta: dar cosmos, robar carta, resetear flags
   * - Devuelve: estado actualizado de la partida
   */
  static async startFirstTurn(matchId: string, userId: string): Promise<any> {
    try {
      console.log(`\n🎮 [startFirstTurn] Iniciando para usuario: ${userId}, match: ${matchId}`);
      
      const match = await Match.findByPk(matchId);
      if (!match) throw new Error('Partida no encontrada');

      TurnValidation.assertMatchActive(match);

      const playerNumber = TurnValidation.assertPlayerInMatch(match, userId);
      console.log(`📍 [startFirstTurn] Player number: ${playerNumber}`);

      // Validar que es el turno del jugador que está iniciando
      if (match.current_player !== playerNumber) {
        throw new Error(`No es tu turno para iniciar la partida (actual: ${match.current_player}, solicitante: ${playerNumber})`);
      }

      console.log(`⏳ [startFirstTurn] Ejecutando TurnManager.startTurn()...`);
      
      // Iniciar el primer turno (da cosmos, roba carta, resetea flags)
      await TurnManager.startTurn(matchId, match.current_player);

      // Obtener estado actualizado
      const updatedMatch = await Match.findByPk(matchId);
      
      // Obtener estado completo con contadores
      const p1Hand = await CardInPlay.count({
        where: { match_id: matchId, player_number: 1, zone: 'hand' }
      });
      const p2Hand = await CardInPlay.count({
        where: { match_id: matchId, player_number: 2, zone: 'hand' }
      });
      const p1Deck = await CardInPlay.count({
        where: { match_id: matchId, player_number: 1, zone: 'deck' }
      });
      const p2Deck = await CardInPlay.count({
        where: { match_id: matchId, player_number: 2, zone: 'deck' }
      });
      
      console.log(`\n✅ [startFirstTurn] Turno iniciado exitosamente`);
      console.log(`   Player ${playerNumber}:`);
      console.log(`   - Cosmos: ${playerNumber === 1 ? updatedMatch?.player1_cosmos : updatedMatch?.player2_cosmos}`);
      console.log(`   - Turno: ${updatedMatch?.current_turn}`);
      console.log(`   - Mano P1: ${p1Hand} cartas`);
      console.log(`   - Mazo P1: ${p1Deck} cartas\n`);

      return {
        success: true,
        message: 'Primer turno iniciado exitosamente',
        match: {
          id: updatedMatch?.id,
          current_turn: updatedMatch?.current_turn,
          current_player: updatedMatch?.current_player,
          phase: updatedMatch?.phase,
          player1_cosmos: updatedMatch?.player1_cosmos,
          player2_cosmos: updatedMatch?.player2_cosmos,
          player1_life: updatedMatch?.player1_life,
          player2_life: updatedMatch?.player2_life,
          player1_hand_count: p1Hand,
          player2_hand_count: p2Hand,
          player1_deck_size: p1Deck,
          player2_deck_size: p2Deck
        }
      };
    } catch (error: any) {
      console.error(`❌ [startFirstTurn] Error:`, error.message);
      throw error;
    }
  }

  /**
   * Ejecuta un ataque entre caballeros
   * - Valida que sea turno del atacante
   * - Valida caballeros validos
   * - Calcula daño
   * - Actualiza salud del defensor
   * - Maneja knockout
   */
  static async attackKnight(
    matchId: string,
    userId: string,
    attackerCardInPlayId: string,
    defenderCardInPlayId: string
  ): Promise<any> {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) throw new Error('Partida no encontrada');

      TurnValidation.assertMatchActive(match);

      const playerNumber = TurnValidation.assertPlayerInMatch(match, userId);
      const isTestMatch = TurnValidation.isTestMatch(match);
      TurnValidation.assertIsPlayerTurn(match, playerNumber, isTestMatch);

      const opponentNumber = playerNumber === 1 ? 2 : 1;

      // Obtener caballeros
      const attackerCardInPlay = await CardInPlay.findOne({
        where: { id: attackerCardInPlayId, match_id: matchId },
        include: [
          {
            model: Card,
            as: 'card',
            include: [{ model: CardKnight, as: 'card_knight' }]
          }
        ]
      });

      const defenderCardInPlay = await CardInPlay.findOne({
        where: { id: defenderCardInPlayId, match_id: matchId },
        include: [
          {
            model: Card,
            as: 'card',
            include: [{ model: CardKnight, as: 'card_knight' }]
          }
        ]
      });

      // Validaciones
      AttackValidation.assertValidAttacker(
        attackerCardInPlay,
        playerNumber,
        userId
      );
      AttackValidation.assertCanAttackThisTurn(attackerCardInPlay!);
      AttackValidation.assertValidDefender(defenderCardInPlay, opponentNumber);
      AttackValidation.assertHasAttackPower(attackerCardInPlay!);
      AttackValidation.assertHasDefensePower(defenderCardInPlay!);

      // Ejecutar ataque
      const attackResult = await AttackManager.executeAttack(
        match,
        attackerCardInPlay!,
        defenderCardInPlay!
      );

      // Registrar acción
      await AttackManager.recordAttack(
        matchId,
        userId,
        attackerCardInPlayId,
        defenderCardInPlayId,
        attackResult.damage,
        attackResult.hit,
        match.current_turn
      );

      console.log(
        `✅ Ataque exitoso: ${attackResult.damage} daño (Golpeador: ${attackResult.hit})`
      );

      return {
        success: true,
        damage: attackResult.damage,
        hit: attackResult.hit,
        defenderHealth: attackResult.defenderHealth,
        isKnockedOut: attackResult.isKnockedOut,
        message: attackResult.hit
          ? `Ataque exitoso: ${attackResult.damage} daño`
          : 'El ataque fue esquivado!'
      };
    } catch (error: any) {
      console.error(`❌ Error en ataque:`, error.message);
      throw error;
    }
  }

  /**
   * Cambia modo defensivo de un caballero
   * Modos: 'normal', 'defense', 'evasion'
   */
  static async changeDefensiveMode(
    matchId: string,
    userId: string,
    cardInPlayId: string,
    newMode: 'normal' | 'defense' | 'evasion'
  ): Promise<CardInPlay> {
    try {
      const match = await Match.findByPk(matchId);
      if (!match) throw new Error('Partida no encontrada');

      TurnValidation.assertMatchActive(match);

      const playerNumber = TurnValidation.assertPlayerInMatch(match, userId);
      const isTestMatch = TurnValidation.isTestMatch(match);
      TurnValidation.assertIsPlayerTurn(match, playerNumber, isTestMatch);

      // Obtener carta
      const cardInPlay = await CardInPlay.findOne({
        where: {
          id: cardInPlayId,
          match_id: matchId,
          player_number: playerNumber,
          zone: 'field_knight'
        }
      });

      if (!cardInPlay) {
        throw new Error('Caballero no encontrado o no en el campo');
      }

      // Validar modo
      AttackValidation.assertValidDefensiveMode(newMode);

      // Cambiar modo
      await AttackManager.changeDefensiveMode(cardInPlay, newMode);

      // Registrar acción
      await MatchAction.create({
        match_id: matchId,
        player_id: userId,
        turn_number: match.current_turn,
        action_type: 'change_mode',
        action_data: JSON.stringify({
          card_in_play_id: cardInPlayId,
          new_mode: newMode
        })
      });

      console.log(`✅ Modo defensivo cambiado a: ${newMode}`);

      return cardInPlay;
    } catch (error: any) {
      console.error(`❌ Error cambiando modo:`, error.message);
      throw error;
    }
  }
}
