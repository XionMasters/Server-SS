/**
 * CardRulesEngine.ts
 * 
 * Lógica pura para operaciones con cartas.
 * 
 * Responsabilidades:
 * ✅ Validar juego de cartas (desde mano a campo)
 * ✅ Calcular costo de cosmos
 * ✅ Validar restricciones de zona
 * ✅ Ejecutar cambios sin mutación (immutable)
 * 
 * Patrón:
 * - validatePlayCard(state, cardId, ...) → {valid, error?}
 * - playCard(state, cardId, ...) → {newState}
 * 
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, CardInGameState } from './GameState';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';

export class CardRulesEngine {
  /**
   * Valida que una carta pueda ser jugada
   * 
   * @param state GameState actual
   * @param playerNumber 1 o 2
   * @param cardId ID de la carta a jugar
   * @param targetZone Zona destino (field_knight, field_technique, etc)
   * @param position Posición en la zona
   * @returns {valid, error?}
   */
  static validatePlayCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    targetZone: string,
    position: number
  ): { valid: boolean; error?: string } {
    const player = playerNumber === 1 ? state.player1 : state.player2;

    // Validar que la carta esté en mano
    const cardInHand = player.hand.find(c => c.instance_id === cardId);
    if (!cardInHand) {
      return { valid: false, error: 'Carta no encontrada en mano' };
    }

    // Validar cosmos suficiente
    const cosmoCost = this._getCardCost(cardInHand);
    if (player.cosmos < cosmoCost) {
      return {
        valid: false,
        error: `Cosmos insuficiente. Requiere: ${cosmoCost}, tienes: ${player.cosmos}`
      };
    }

    // Validar que la zona tenga espacio
    const targetField = this._getFieldByZone(player, targetZone);
    if (!targetField) {
      return { valid: false, error: `Zona inválida: ${targetZone}` };
    }

    if (targetField.length >= this._getMaxCardsInZone(targetZone)) {
      return { valid: false, error: `Zona ${targetZone} está llena` };
    }

    // Validar posición válida
    if (position < 0 || position > targetField.length) {
      return { valid: false, error: `Posición inválida: ${position}` };
    }

    return { valid: true };
  }

  /**
   * Ejecuta el juego de una carta
   * Retorna nuevo GameState inmutable
   * 
   * @param state GameState actual
   * @param playerNumber 1 o 2
   * @param cardId ID de la carta
   * @param targetZone Zona destino
   * @param position Posición
   * @returns {newState}
   */
  static playCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    targetZone: string,
    position: number
  ): { newState: GameState } {
    // Usar structuredClone para inmutabilidad
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    // Encontrar y remover carta de mano
    const cardIndex = player.hand.findIndex(c => c.instance_id === cardId);
    const card = player.hand[cardIndex];
    player.hand.splice(cardIndex, 1);

    // Reducir cosmos
    const cosmoCost = this._getCardCost(card);
    player.cosmos -= cosmoCost;

    // Agregar a zona destino
    const targetField = this._getFieldByZone(player, targetZone);
    if (targetField) {
      targetField.splice(position, 0, card);
    }

    return { newState };
  }

  /**
   * (FUTURO) Mover carta dentro del campo
   */
  static moveCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    fromZone: string,
    toZone: string,
    toPosition: number
  ): { newState: GameState } {
    const newState = structuredClone(state);
    // TODO: Implementar lógica de movimiento
    return { newState };
  }

  /**
   * (FUTURO) Descartar carta
   */
  static discardCard(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string
  ): { newState: GameState } {
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    // Encontrar en cualquier zona
    for (const zone of [player.hand, player.field_knights, player.field_techniques]) {
      const index = zone.findIndex(c => c.instance_id === cardId);
      if (index >= 0) {
        zone.splice(index, 1);
        player.graveyard_count += 1;
        break;
      }
    }

    return { newState };
  }

  // ====================================================================
  // Helpers privados
  // ====================================================================

  private static _getCardCost(card: CardInGameState): number {
    // Asume que card tiene cost en sus propiedades
    return (card as any).cost || 0;
  }

  private static _getFieldByZone(player: any, zone: string): CardInGameState[] | null {
    switch (zone) {
      case 'hand':
        return player.hand;
      case 'field_knight':
        return player.field_knights;
      case 'field_technique':
        return player.field_techniques;
      case 'helper':
        return player.helper ? [player.helper] : [];
      default:
        return null;
    }
  }

  private static _getMaxCardsInZone(zone: string): number {
    switch (zone) {
      case 'field_knight':
        return 5;
      case 'field_technique':
        return 5;
      default:
        return 99; // Sin límite
    }
  }
}

/**
 * NOTAS:
 * 
 * 1. CardRulesEngine NO conoce:
 *    - Sequelize
 *    - Base de datos
 *    - Transacciones
 *    - WebSocket
 * 
 * 2. Entrada: GameState (puro)
 *    Salida: Nuevo GameState (immutable via structuredClone)
 * 
 * 3. Usar en CardManager:
 *    const result = CardRulesEngine.playCard(state, ...)
 *    await MatchRepository.applyState(match, result.newState, transaction)
 */
