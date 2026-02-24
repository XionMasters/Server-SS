/**
 * AttackRulesEngine.ts
 * 
 * Lógica pura para el sistema de combate.
 * 
 * Responsabilidades:
 * ✅ Validar ataque (atacante existe, defensor existe)
 * ✅ Calcular daño (según modos defensivos)
 * ✅ Aplicar efectos de ataque
 * ✅ Ejecutar cambios sin mutación (immutable)
 * 
 * Patrón:
 * - validateAttack(state, attacker, defender) → {valid, error?}
 * - attack(state, attacker, defender) → {newState, damage}
 * 
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, CardInGameState } from './GameState';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';

export class AttackRulesEngine {
  /**
   * Valida que un ataque sea posible
   * 
   * @param state GameState actual
   * @param playerNumber Jugador atacante (1 o 2)
   * @param attackerCardId ID de carta atacante
   * @param defenderCardId ID de carta defensora
   * @returns {valid, error?}
   */
  static validateAttack(
    state: GameState,
    playerNumber: 1 | 2,
    attackerCardId: string,
    defenderCardId: string
  ): { valid: boolean; error?: string } {
    const attackerPlayer = playerNumber === 1 ? state.player1 : state.player2;
    const defenderPlayer = playerNumber === 1 ? state.player2 : state.player1;

    // Validar que atacante existe y está en campo
    const attacker = this._findCardInField(attackerPlayer, attackerCardId);
    if (!attacker) {
      return { valid: false, error: 'Carta atacante no encontrada en campo' };
    }

    // Validar que no esté exhausto
    if ((attacker as any).is_exhausted) {
      return { valid: false, error: 'Carta atacante está exhausto' };
    }

    // Validar que defensor existe
    const defender = this._findCardInField(defenderPlayer, defenderCardId);
    if (!defender) {
      return { valid: false, error: 'Carta defensora no encontrada' };
    }

    // Validar que no esté en modo evasión (50% chance - puede defenderse)
    // Nota: Evasión se evalúa en EJECUCIÓN, no en validación

    return { valid: true };
  }

  /**
   * Ejecuta un ataque entre dos cartas
   * Retorna nuevo GameState + daño infligido
   * 
   * @param state GameState actual
   * @param playerNumber Jugador atacante
   * @param attackerCardId Carta atacante
   * @param defenderCardId Carta defensora
   * @returns {newState, damage}
   */
  static attack(
    state: GameState,
    playerNumber: 1 | 2,
    attackerCardId: string,
    defenderCardId: string
  ): { newState: GameState; damage: number } {
    const newState = structuredClone(state);
    const attackerPlayer = playerNumber === 1 ? newState.player1 : newState.player2;
    const defenderPlayer = playerNumber === 1 ? newState.player2 : newState.player1;

    const attacker = this._findCardInField(attackerPlayer, attackerCardId)!;
    const defender = this._findCardInField(defenderPlayer, defenderCardId)!;

    // Obtener stats del atacante (CE - Combat Effectiveness)
    const attackerCE = (attacker as any).ce || 0;

    // Obtener modo defensivo del defensor
    const defenderMode = (defender as any).mode || 'normal';

    // Calcular daño según modo
    let damage = attackerCE;

    if (defenderMode === 'defense') {
      // Modo Defensa: daño reducido a la mitad
      damage = Math.floor(attackerCE / 2);
    } else if (defenderMode === 'evasion') {
      // Modo Evasión: 50% chance de evitar (coin flip)
      const coinFlip = Math.random() < 0.5; // true=heads (hit), false=tails (miss)
      if (!coinFlip) {
        damage = 0; // Ataque evitado
      }
    }

    // Restar AR (Armor) del defensor
    const defenderAR = (defender as any).ar || 0;
    damage = Math.max(1, damage - defenderAR); // Mínimo 1 de daño

    // Aplicar daño: reducir vida del defensor
    defenderPlayer.life -= damage;

    // Marcar atacante como exhausto (ya atacó)
    (attacker as any).is_exhausted = true;

    // Validar si alguien ganó
    if (defenderPlayer.life <= 0) {
      defenderPlayer.life = 0;
      newState.phase = 'game_over';
      // TODO: Implementar lógica de ganador
    }

    return { newState, damage };
  }

  /**
   * (FUTURO) Cambiar modo defensivo
   */
  static changeDefensiveMode(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    mode: 'normal' | 'defense' | 'evasion'
  ): { newState: GameState } {
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const card = this._findCardInField(player, cardId);
    if (card) {
      (card as any).mode = mode;
    }

    return { newState };
  }

  // ====================================================================
  // Helpers privados
  // ====================================================================

  private static _findCardInField(player: any, cardId: string): CardInGameState | null {
    // Buscar en todas las zonas del jugador
    for (const zone of [
      player.field_knights,
      player.field_techniques,
      player.helper,
      player.special_card,
    ]) {
      if (Array.isArray(zone)) {
        const found = zone.find((c: any) => c.id === cardId);
        if (found) return found;
      } else if (zone && (zone as any).id === cardId) {
        return zone;
      }
    }
    return null;
  }
}

/**
 * NOTAS:
 * 
 * 1. AttackRulesEngine NO conoce:
 *    - Sequelize
 *    - Base de datos
 *    - Transacciones
 *    - WebSocket
 * 
 * 2. Entrada: GameState (puro)
 *    Salida: Nuevo GameState (immutable via structuredClone)
 * 
 * 3. Evasión (50% chance):
 *    - Se resuelve AQUÍ, no en coordinador
 *    - Math.random() válido porque es dentro de engine (no BD)
 *    - Cliente podría predicción en local, servidor es autoridad
 * 
 * 4. Usar en AttackManager:
 *    const result = AttackRulesEngine.attack(state, ...)
 *    await MatchRepository.applyState(match, result.newState, transaction)
 */
