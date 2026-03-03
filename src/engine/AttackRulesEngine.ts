/**
 * AttackRulesEngine.ts
 *
 * Lógica pura para el sistema de combate.
 *
 * Responsabilidades:
 * ✅ Validar ataque (atacante existe, defensor existe o es daño directo)
 * ✅ Calcular daño (según modos defensivos)
 * ✅ Aplicar daño al jugador defensor
 * ✅ Detectar ganador (life <= 0)
 * ✅ Ejecutar cambios sin mutación (immutable)
 *
 * Patrón:
 * - validateAttack(state, attacker, defender|null) → {valid, error?}
 * - attack(state, attacker, defender|null)         → {newState, damage, evaded}
 *
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, CardInGameState, Player, resolveWinCondition } from './GameState';
import { StatusEffect, MODE_EFFECT_TYPES, deriveModeFromEffects, setModeEffect } from './StatusEffects';

export class AttackRulesEngine {
  /**
   * Valida que un ataque sea posible.
   * Si defenderCardId es null → ataque directo al jugador (sin bloqueador).
   */
  static validateAttack(
    state: GameState,
    playerNumber: 1 | 2,
    attackerCardId: string,
    defenderCardId: string | null
  ): { valid: boolean; error?: string } {
    const attackerPlayer = playerNumber === 1 ? state.player1 : state.player2;
    const defenderPlayer = playerNumber === 1 ? state.player2 : state.player1;

    // Validar que atacante existe y está en campo
    const attacker = this._findCardInField(attackerPlayer, attackerCardId);
    if (!attacker) {
      return { valid: false, error: 'Carta atacante no encontrada en campo' };
    }

    // Validar que no esté exhausto
    if (attacker.is_exhausted) {
      return { valid: false, error: 'Carta atacante está exhausto' };
    }

    // Si se especifica defensor, validar que exista
    if (defenderCardId !== null) {
      const defender = this._findCardInField(defenderPlayer, defenderCardId);
      if (!defender) {
        return { valid: false, error: 'Carta defensora no encontrada en campo' };
      }
    }

    return { valid: true };
  }

  /**
   * Ejecuta un ataque.
   * Si defenderCardId es null → daño directo al jugador (CE del atacante, sin AR).
   */
  static attack(
    state: GameState,
    playerNumber: 1 | 2,
    attackerCardId: string,
    defenderCardId: string | null
  ): { newState: GameState; damage: number; evaded: boolean } {
    const newState = structuredClone(state);
    const attackerPlayer = playerNumber === 1 ? newState.player1 : newState.player2;
    const defenderPlayer = playerNumber === 1 ? newState.player2 : newState.player1;

    const attacker = this._findCardInField(attackerPlayer, attackerCardId)!;
    const attackerCE: number = attacker.ce ?? 0;

    let damage = 0;
    let evaded = false;

    if (defenderCardId === null) {
      // ── DAÑO DIRECTO ──────────────────────────────────────────────────────
      damage = Math.max(1, attackerCE);
    } else {
      // ── COMBATE NORMAL ────────────────────────────────────────────────────
      const defender = this._findCardInField(defenderPlayer, defenderCardId)!;
      const defenderMode: string = defender.mode || 'normal';
      const defenderAR: number = defender.ar ?? 0;

      switch (defenderMode) {
        case 'defense':
          damage = Math.max(1, Math.floor(attackerCE / 2) - defenderAR);
          break;

        case 'evasion': {
          // Solo BA (ataque básico) puede ser evitado al 50 %
          const coinFlip = Math.random() < 0.5; // true = golpea, false = esquiva
          if (coinFlip) {
            damage = Math.max(1, attackerCE - defenderAR);
          } else {
            damage = 0;
            evaded = true;
          }
          break;
        }

        default:
          damage = Math.max(1, attackerCE - defenderAR);
          break;
      }
    }

    // Aplicar daño al jugador defensor
    if (!evaded) {
      defenderPlayer.life = Math.max(0, defenderPlayer.life - damage);
    }

    // Marcar atacante como exhausto
    attacker.is_exhausted = true;
    attacker.attacked_this_turn = true;

    // Verificar ganador
    resolveWinCondition(newState);

    newState.updated_at = Date.now();

    return { newState, damage, evaded };
  }

  /**
   * Cambia el modo defensivo de una carta en campo.
   * Implementado como StatusEffect con remaining_turns = 1:
   *   - El efecto es activo durante el turno del rival que le sigue.
   *   - Al inicio del próximo turno propio, se decrementa → expira.
   *
   * Pasar mode = 'normal' elimina cualquier efecto de modo activo (cancelar defensa/evasión).
   */
  static changeDefensiveMode(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
    mode: 'normal' | 'defense' | 'evasion'
  ): { newState: GameState; error?: string } {
    const newState = structuredClone(state);
    const player = playerNumber === 1 ? newState.player1 : newState.player2;

    const card = this._findCardInField(player, cardId);
    if (!card) {
      return { newState, error: 'Carta no encontrada en campo' };
    }

    // Reemplazar efecto de modo (elimina previo y aplica el nuevo)
    if (mode !== 'normal') {
      card.status_effects = setModeEffect(card.status_effects ?? [], mode, 1);
    } else {
      card.status_effects = (card.status_effects ?? []).filter(
        e => !MODE_EFFECT_TYPES.includes(e.type)
      );
    }

    // Recomputar modo desde los efectos actualizados
    card.mode = deriveModeFromEffects(card.status_effects);

    // Marcar como exhausto (usar acción de modo consume el turno del caballero)
    card.is_exhausted = true;
    card.attacked_this_turn = true;

    newState.updated_at = Date.now();
    return { newState };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Helpers privados
  // ══════════════════════════════════════════════════════════════════════════

  /** Busca una carta en todas las zonas de campo del jugador por instance_id. */
  private static _findCardInField(player: Player, cardId: string): CardInGameState | null {
    const zones: (CardInGameState[] | CardInGameState | null)[] = [
      player.field_knights,
      player.field_techniques,
      player.field_helper,
      player.field_occasion,
    ];

    for (const zone of zones) {
      if (Array.isArray(zone)) {
        const found = zone.find(c => c.instance_id === cardId);
        if (found) return found;
      } else if (zone && zone.instance_id === cardId) {
        return zone;
      }
    }
    return null;
  }
}

/**
 * NOTAS:
 *
 * 1. CE / AR se almacenan en CardInGameState via la propiedad extendida
 *    que MatchStateMapper rellena al construir el GameState desde BD.
 * 2. Modo evasión solo aplica a BA (ataque básico).
 *    Para TA (técnicas) tratar siempre como 'normal'.
 * 3. AttackRulesEngine NO conoce: Sequelize, BD, Transacciones, WebSocket.
 */
