// src/services/game/turnManager.ts
import Match from '../../models/Match';
import CardInPlay from '../../models/CardInPlay';
import sequelize from '../../config/database';

/**
 * TurnManager - Gestiona todo lo relacionado con turnos
 * Responsabilidades:
 * - Inicio de turno (cosmos, robar carta, resetear flags)
 * - Fin de turno
 * - Cambio de turno
 */

export class TurnManager {
  /**
   * Ejecuta el inicio de turno del jugador
   * 1. Da cosmos (+1, máximo 10)
   * 2. Resetea flags de ataque
   * 3. Roba 1 carta
   * 4. Ejecuta efectos de inicio de turno (TODO)
   */
  static async startTurn(matchId: string, playerNumber: number): Promise<void> {
    const match = await Match.findByPk(matchId);
    if (!match) throw new Error('Match no encontrado');

    console.log(`📘 Iniciando turno para player ${playerNumber}`);

    // 1️⃣ DAR COSMOS (incrementar +1, máximo 10)
    this.giveCosmos(match, playerNumber);

    // 2️⃣ RESETEAR FLAGS DE ATAQUE
    await this.resetAttackFlags(matchId, playerNumber);

    // 3️⃣ ROBAR CARTA
    await this.drawCard(matchId, playerNumber);

    // 4️⃣ EJECUTAR EFECTOS ON_TURN_START (TODO)
    // Buscar cartas en campo con habilidad "on_turn_start"
    // await EffectsManager.triggerTurnStart(match, playerNumber);

    // Guardar cambios
    await match.save();
  }

  /**
   * Da cosmos al jugador al inicio del turno
   */
  static giveCosmos(match: any, playerNumber: number): void {
    if (playerNumber === 1) {
      match.player1_cosmos = Math.min(match.player1_cosmos + 1, 10);
      console.log(`💫 Player 1 cosmos: ${match.player1_cosmos}`);
    } else {
      match.player2_cosmos = Math.min(match.player2_cosmos + 1, 10);
      console.log(`💫 Player 2 cosmos: ${match.player2_cosmos}`);
    }
  }

  /**
   * Resetea los flags de ataque para el jugador
   */
  static async resetAttackFlags(matchId: string, playerNumber: number): Promise<void> {
    await CardInPlay.update(
      { has_attacked_this_turn: false, can_attack_this_turn: true },
      { where: { match_id: matchId, player_number: playerNumber } }
    );
    console.log(`⚔️ Flags de ataque reseteados para player ${playerNumber}`);
  }

  /**
   * Roba una carta del deck
   */
  static async drawCard(matchId: string, playerNumber: number): Promise<void> {
    const deckCards = await CardInPlay.findAll({
      where: { match_id: matchId, player_number: playerNumber, zone: 'deck' },
      order: [sequelize.fn('RANDOM')],
      limit: 1
    });

    if (deckCards.length > 0) {
      deckCards[0].zone = 'hand';
      await deckCards[0].save();
      console.log(`🃏 Carta robada para player ${playerNumber}`);
    } else {
      console.log(`⚠️ No hay cartas en el deck de player ${playerNumber}`);
    }
  }

  /**
   * Pasa el turno al siguiente jugador
   */
  static async passTurn(match: any, currentPlayerId: string): Promise<string> {
    const nextPlayer = match.current_player === 1 ? 2 : 1;
    match.current_player = nextPlayer;
    match.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';

    // Si vuelve al player 1, incrementar contador de turnos
    if (nextPlayer === 1) {
      match.current_turn += 1;
    }

    await match.save();
    console.log(`🔄 Turno pasado: ahora es turno del player ${nextPlayer}`);

    return nextPlayer.toString();
  }
}
