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
import {
  StatusEffect,
  StatusEffectType,
  consumeBasicAttackEffects,
  deriveModeFromEffects,
  getBasicAttackCeMultiplier,
  isModeEffectType,
  setModeEffect,
} from './StatusEffects';
import { createEngineContext } from './EngineContext';
import { applyDamage } from './actions/DamageAction';
import { createEvent } from './events/GameEvents';
import type { GameEvent } from './events/GameEvents';

export class AttackRulesEngine {
  private static _validateTurnAndPhase(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    if (state.current_player !== playerNumber) {
      return {
        valid: false,
        error: `No es turno del jugador ${playerNumber}. Turno actual: ${state.current_player}`,
      };
    }

    if (state.phase === 'game_over') {
      return { valid: false, error: 'La partida ya terminó' };
    }

    const expectedPhase = playerNumber === 1 ? 'player1_turn' : 'player2_turn';
    if (state.phase !== expectedPhase) {
      return {
        valid: false,
        error: `Fase inválida para atacar: ${state.phase}`,
      };
    }

    return { valid: true };
  }

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
    const turnValidation = this._validateTurnAndPhase(state, playerNumber);
    if (!turnValidation.valid) {
      return turnValidation;
    }

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
   *
   * Retorna events[] para que el service layer los incluya en el broadcast al cliente.
   */
  static attack(
  state: GameState,
  playerNumber: 1 | 2,
  attackerCardId: string,
  defenderCardId: string | null
): {
  newState: GameState;
  damage: number;
  evaded: boolean;
  events: GameEvent[];
} {
  // Crear contexto: clona el estado y crea un bus local para esta operación
  const engineCtx = createEngineContext(state);
  const rng = new SeededRNG(engineCtx.state.rng_seed);

  const attackerPlayer = playerNumber === 1 ? engineCtx.state.player1 : engineCtx.state.player2;
  const defenderPlayer = playerNumber === 1 ? engineCtx.state.player2 : engineCtx.state.player1;

  const attacker = this._findCardInField(attackerPlayer, attackerCardId)!;

  // Aplicar modificadores declarativos de BA (ej: ce_double)
  const _origAttackerCe = attacker.ce;
  const ceMultiplier = getBasicAttackCeMultiplier(attacker.status_effects ?? []);
  if (ceMultiplier !== 1) {
    attacker.ce = (attacker.ce ?? 0) * ceMultiplier;
  }

  let damageToCard   = 0;
  let damageToPlayer = 0;
  let evaded         = false;

  if (!defenderCardId) {
    // Ataque directo al jugador: daño fijo, sin carta defensora
    damageToPlayer = 2;
  } else {
    const defender = this._findCardInField(defenderPlayer, defenderCardId)!;

    // Determinación Interior: inmunidad total si ya tiene last_stand_active
    const hasLastStandActive = (defender.status_effects ?? []).some(e => e.type === 'last_stand_active');
    // Determinación Interior: sobrevive letal la primera vez con last_stand
    const hasLastStand = (defender.status_effects ?? []).some(e => e.type === 'last_stand');

    const combatCtx: CombatContext = {
      state: engineCtx.state,
      attacker,
      defender,
      defenderPlayer,
    };

    const resolver =
      CombatModeResolvers[defender.mode ?? 'normal'] ??
      CombatModeResolvers.normal;

    const result = resolver(combatCtx, rng);

    damageToCard = result.damageToCard;
    evaded       = result.evaded;

    if (!evaded && !hasLastStandActive) {
      const wouldDie = defender.current_health - damageToCard <= 0;

      if (wouldDie && hasLastStand) {
        // ── Determinación Interior ──────────────────────────────────────────
        // El caballero absorbe el golpe letal pero sobrevive con 1 HP.
        // Gana inmunidad total (last_stand_active) por 1 turno.
        // Emite DAMAGE_DEALT pero NO letal ni muerte.
        defender.current_health = 1;
        defender.status_effects = [
          ...(defender.status_effects ?? []).filter(e => e.type !== 'last_stand'),
          { type: 'last_stand_active' as StatusEffectType, remaining_turns: 1 },
        ];
        engineCtx.bus.emit(
          createEvent({
            type: 'DAMAGE_DEALT',
            playerNumber: defender.player_number,
            sourceCardId: attackerCardId,
            targetCardId: defenderCardId,
            origin: 'player',
            payload: { amount: damageToCard, instanceId: defenderCardId },
          }),
        );
        // No hay DIP por last_stand
      } else {
        // ── Camino normal ───────────────────────────────────────────────────
        // applyDamage emite DAMAGE_DEALT → DAMAGE_LETHAL → killKnight si HP <= 0
        applyDamage(engineCtx, defenderCardId, damageToCard, attackerCardId);

        // Si la carta murió (no está en campo), genera 1 DIP al jugador
        const defenderStillAlive = this._findCardInField(defenderPlayer, defenderCardId);
        if (!defenderStillAlive) {
          damageToPlayer = 1;
        }
      }
    }
  }

  // Evento de ataque conectado: distinto de DAMAGE_DEALT.
  // DAMAGE_DEALT se emite por carta dañada; ATTACK_CONNECTED describe el resultado del ataque completo.
  if (!evaded) {
    engineCtx.bus.emit(
      createEvent({
        type: 'ATTACK_CONNECTED',
        playerNumber,
        sourceCardId: attackerCardId,
        ...(defenderCardId ? { targetCardId: defenderCardId } : {}),
        origin: 'player',
        payload: {
          attack_type: 'BA',
          damage_to_card: damageToCard,
          damage_to_player: damageToPlayer,
          ...(defenderCardId ? { defender_card_id: defenderCardId } : {}),
        },
      }),
    );
  }

  defenderPlayer.life = Math.max(0, defenderPlayer.life - damageToPlayer);

  // Consumir efectos one-shot de BA de forma declarativa (ignore_armor, ce_double, etc.)
  attacker.status_effects = consumeBasicAttackEffects(attacker.status_effects ?? []);
  // Restaurar CE original para no propagar el cambio temporal al estado persistente
  attacker.ce = _origAttackerCe;

  attacker.is_exhausted      = true;
  attacker.attacked_this_turn = true;

  engineCtx.state.rng_seed = rng.getSeed();

  resolveWinCondition(engineCtx.state);

  return {
    newState: engineCtx.state,
    damage:   damageToCard,
    evaded,
    events:   [...engineCtx.bus.events],
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
    const turnValidation = this._validateTurnAndPhase(state, playerNumber);
    if (!turnValidation.valid) {
      return { newState: structuredClone(state), error: turnValidation.error };
    }

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
        e => !isModeEffectType(e.type)
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
