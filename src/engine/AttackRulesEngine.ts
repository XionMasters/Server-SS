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

import { CombatModeResolvers } from './combat/CombatResolvers';
import { CombatContext } from './combat/CombatTypes';
import { SeededRNG } from './combat/RNG';
import { GameState, CardInGameState, Player, resolveWinCondition } from './GameState';
import { StatusEffect, StatusEffectType, MODE_EFFECT_TYPES, deriveModeFromEffects, setModeEffect } from './StatusEffects';

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
) {
  const newState = structuredClone(state);
  const rng = new SeededRNG(newState.rng_seed);

  const attackerPlayer = playerNumber === 1 ? newState.player1 : newState.player2;
  const defenderPlayer = playerNumber === 1 ? newState.player2 : newState.player1;

  const attacker = this._findCardInField(attackerPlayer, attackerCardId)!;

  // Detectar habilidades activas ANTES de resolución (en estado no-clonado de attacker)
  const hadIgnoreArmor = (attacker.status_effects ?? []).some(e => e.type === 'ignore_armor');
  const hasUnicornHorn = (attacker.status_effects ?? []).some(e => e.type === 'unicorn_horn');
  const hasHerdEffect  = (attacker.status_effects ?? []).some(e => e.type === 'herd_effect');

  let damageToCard = 0;
  let damageToPlayer = 0;
  let evaded = false;

  if (!defenderCardId) {
    damageToPlayer = 2; // regla fija
  } else {
    const defender = this._findCardInField(defenderPlayer, defenderCardId)!;

    // Determinación Interior: si el defensor tiene last_stand_active, es inmune a todo daño
    const hasLastStandActive = (defender.status_effects ?? []).some(e => e.type === 'last_stand_active');

    const ctx: CombatContext = {
      state: newState,
      attacker,
      defender,
      defenderPlayer
    };

    const resolver =
      CombatModeResolvers[defender.mode ?? "normal"] ??
      CombatModeResolvers.normal;

    const result = resolver(ctx, rng);

    damageToCard = result.damageToCard;
    evaded = result.evaded;

    if (!evaded && !hasLastStandActive) {
      defender.current_health -= damageToCard;

      if (defender.current_health <= 0) {
        const hasLastStand = (defender.status_effects ?? []).some(e => e.type === 'last_stand');

        if (hasLastStand) {
          // Determinación Interior: sobrevive con 1 HP e inmunidad total durante 1 turno
          defender.current_health = 1;
          defender.status_effects = [
            ...(defender.status_effects ?? []).filter(e => e.type !== 'last_stand'),
            { type: 'last_stand_active' as StatusEffectType, remaining_turns: 1 },
          ];
          // No va al yomotsu, no causa DIP
        } else {
          defenderPlayer.field_knights =
            defenderPlayer.field_knights.filter(
              c => c.instance_id !== defenderCardId
            );

          defender.zone = "yomotsu";
          defenderPlayer.graveyard_count += 1;

          damageToPlayer = 1; // regla fija
        }
      }
    }
  }

  // Cuerno de Unicornio: +1 DIP al jugador rival solo si el ataque conectó (no esquivado)
  if (hasUnicornHorn && !evaded) {
    damageToPlayer += 1;
  }

  // Efecto Manada: +1 DIP extra si el AB ya está causando DIP (el origen no importa)
  if (hasHerdEffect && damageToPlayer > 0) {
    damageToPlayer += 1;
  }

  defenderPlayer.life = Math.max(
    0,
    defenderPlayer.life - damageToPlayer
  );

  // Consumir ignore_armor (efecto de un solo uso por ataque)
  if (hadIgnoreArmor) {
    attacker.status_effects = (attacker.status_effects ?? []).filter(
      e => e.type !== 'ignore_armor'
    );
  }

  attacker.is_exhausted = true;
  attacker.attacked_this_turn = true;

  newState.rng_seed = rng.getSeed();

  resolveWinCondition(newState);

  return {
    newState,
    damage: damageToCard,
    evaded
  };
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
