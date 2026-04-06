/**
 * TurnRulesEngine.ts
 * 
 * Motor PURO de reglas de turno.
 * ✅ SIN BD
 * ✅ SIN await
 * ✅ SIN Sequelize
 * ✅ Determinístico
 * ✅ Testeable sin servidor
 * 
 * Entrada: GameState (snapshot)
 * Salida: { valid: boolean, error?: string } u { newState: GameState }
 * 
 * Responsabilidades:
 * - Validar que un turno sea legal (¿es su turno?, ¿fase válida?)
 * - Ejecutar lógica de fin de turno (cambiar jugador, otorgar cosmos, etc.)
 * - Retornar nuevo estado (inmutable)
 */

import { GameState } from './GameState';
import { deriveModeFromEffects, computeCeBonus, computeArBonus, computeHpBonus, tickStatusEffects } from './StatusEffects';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';
import { createEngineContext, type EngineContext } from './EngineContext';
import { applyDamage } from './actions/DamageAction';

function _recomputeDerivedStatsWithHpClamp(card: any, effectsBeforeTick: any[]): void {
  const prevHpBonus = computeHpBonus(effectsBeforeTick ?? []);
  const baseMaxHp = Math.max(0, (card.max_health ?? card.current_health ?? 0) - prevHpBonus);
  const nextHpBonus = computeHpBonus(card.status_effects ?? []);
  card.max_health = baseMaxHp + nextHpBonus;
  card.current_health = Math.min(card.current_health ?? 0, card.max_health);

  card.mode = deriveModeFromEffects(card.status_effects);
  card.ce   = card.base_ce + computeCeBonus(card.status_effects);
  card.ar   = card.base_ar + computeArBonus(card.status_effects);
}

function _findCardInOwnedField(player: any, cardId: string): any | null {
  return (
    player.field_knights.find((c: any) => c.instance_id === cardId) ??
    player.field_techniques.find((c: any) => c.instance_id === cardId) ??
    (player.field_helper?.instance_id === cardId ? player.field_helper : null) ??
    (player.field_occasion?.instance_id === cardId ? player.field_occasion : null)
  );
}

function _applyDotDamageIfPresent(ctx: EngineContext, card: any, effects: any[]): void {
  // DOT (burn/poison) solo aplica a caballeros en campo.
  if (card.zone !== 'field_knight') return;

  const hasBurnImmune   = effects.some(e => e.type === 'burn_immune'   || e.type === 'dot_immune');
  const hasPoisonImmune = effects.some(e => e.type === 'poison_immune' || e.type === 'dot_immune');

  if (!hasBurnImmune) {
    const burnEffect = effects.find(e => e.type === 'burn');
    if (typeof burnEffect?.value === 'number' && burnEffect.value > 0) {
      applyDamage(ctx, card.instance_id, burnEffect.value);
    }
  }

  // Si murió por burn, ya no existe en field_knights y no debe recibir poison.
  const stillAliveAfterBurn = _findCardInOwnedField(
    card.player_number === 1 ? ctx.state.player1 : ctx.state.player2,
    card.instance_id,
  );
  if (!stillAliveAfterBurn) return;

  if (!hasPoisonImmune) {
    const poisonEffect = effects.find(e => e.type === 'poison');
    if (typeof poisonEffect?.value === 'number' && poisonEffect.value > 0) {
      applyDamage(ctx, card.instance_id, poisonEffect.value);
    }
  }
}

export class TurnRulesEngine {
  /**
   * Valida si un jugador puede terminar su turno
   * 
   * Reglas validadas:
   * 1. ¿Es el turno del jugador?
   * 2. ¿La fase es válida?
   * 3. ¿El estado está en condición de terminar turno?
   * 
   * @param state GameState snapshot
   * @param playerNumber Número del jugador (1 o 2)
   * @returns { valid: boolean, error?: string }
   */
  static validateEndTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    // Regla 1: ¿Es su turno?
    if (state.current_player !== playerNumber) {
      return {
        valid: false,
        error: `No es turno del jugador ${playerNumber}. Turno actual: ${state.current_player}`,
      };
    }

    // Regla 2: ¿Fase válida?
    const validPhases = ['player1_turn', 'player2_turn'];
    if (!validPhases.includes(state.phase)) {
      return {
        valid: false,
        error: `Fase inválida para terminar turno: ${state.phase}`,
      };
    }

    // Regla 3: ¿Partida no finalizada?
    if (state.phase === 'game_over') {
      return {
        valid: false,
        error: 'No puedes terminar turno en partida finalizada',
      };
    }

    // Todos los checks pasaron
    return { valid: true };
  }

  /**
   * Ejecuta fin de turno
   * 
   * Mutaciones:
   * 1. Cambiar jugador actual
   * 2. Cambiar fase
   * 3. Incrementar número de turno (solo cuando vuelve a jugador 1)
   * 4. Otorgar cosmos al siguiente jugador (según BASE_MATCH_RULES)
   * 5. (Futuro) Resetear flags de ataque
   * 6. (Futuro) Robar carta
   * 
   * CRÍTICO: Usa structuredClone para inmutabilidad
   * Node 18+: structuredClone disponible
   * Alternativa para Node < 18: JSON.parse(JSON.stringify(state))
   * 
   * @param state GameState snapshot
   * @param playerNumber Número del jugador (1 o 2)
   * @returns { newState: GameState }
   */
  static endTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { newState: GameState } {
    // 🔒 INMUTABILIDAD: Clonar estado (NO mutamos el original)
    // structuredClone es más seguro que JSON.parse(JSON.stringify(...))
    const newState = structuredClone(state);

    // Calcular próximo jugador
    const nextPlayer = playerNumber === 1 ? 2 : 1;

    // 1️⃣ Cambiar jugador actual
    newState.current_player = nextPlayer;

    // 2️⃣ Cambiar fase
    newState.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';

    // 3️⃣ Incrementar número de turno (solo cuando vuelve a jugador 1)
    if (nextPlayer === 1) {
      newState.current_turn += 1;
    }

    // 4️⃣ Otorgar cosmos al siguiente jugador (automático al inicio de turno)
    const cosmosOnTurnStart = BASE_MATCH_RULES.turn.cosmos_on_turn_start;
    const cosmosIncrease = typeof cosmosOnTurnStart === 'function' ? cosmosOnTurnStart(newState.current_turn) : cosmosOnTurnStart;
    const nextPlayerObj = newState[nextPlayer === 1 ? 'player1' : 'player2'];
    nextPlayerObj.cosmos += cosmosIncrease;

    // Contexto para enrutamiento unificado de daño (DOTs pasan por DamageAction).
    const dotCtx = createEngineContext(newState);
    const nextPlayerObjInCtx = dotCtx.state[nextPlayer === 1 ? 'player1' : 'player2'];

    // 5️⃣ Procesar status_effects del siguiente jugador:
    //    - Decrementar remaining_turns de cada efecto
    //    - Eliminar efectos expirados (remaining_turns <= 0)
    //    - Recomputar mode, ce y ar desde los efectos restantes
    const allNextPlayerCardIds = [
      ...nextPlayerObjInCtx.field_knights.map((c: any) => c.instance_id),
      ...nextPlayerObjInCtx.field_techniques.map((c: any) => c.instance_id),
      ...(nextPlayerObjInCtx.field_helper ? [nextPlayerObjInCtx.field_helper.instance_id] : []),
      ...(nextPlayerObjInCtx.field_occasion ? [nextPlayerObjInCtx.field_occasion.instance_id] : []),
    ];

    for (const cardId of allNextPlayerCardIds) {
      const card = _findCardInOwnedField(nextPlayerObjInCtx, cardId);
      if (!card) continue;

      const effects = card.status_effects ?? [];
      _applyDotDamageIfPresent(dotCtx, card, effects);

      const cardAfterDot = _findCardInOwnedField(nextPlayerObjInCtx, cardId);
      if (!cardAfterDot) continue;

      const effectsBeforeTick = [...(cardAfterDot.status_effects ?? [])];
      cardAfterDot.status_effects = tickStatusEffects(cardAfterDot.status_effects ?? []);
      _recomputeDerivedStatsWithHpClamp(cardAfterDot, effectsBeforeTick);
    }

    // También tickear passive_watchers (cartas en yomotsu/mazo con pasivas reactivas)
    // para soportar cooldowns "una vez por turno" fuera del campo.
    for (const watcher of nextPlayerObjInCtx.passive_watchers ?? []) {
      const effectsBeforeTick = [...(watcher.status_effects ?? [])];
      watcher.status_effects = tickStatusEffects(watcher.status_effects ?? []);
      _recomputeDerivedStatsWithHpClamp(watcher, effectsBeforeTick);
    }

    // Resetear flags de exhaust del siguiente jugador (puede volver a atacar)
    const fieldsToReset = [
      nextPlayerObjInCtx.field_knights,
      nextPlayerObjInCtx.field_techniques,
    ];
    fieldsToReset.forEach(field => {
      field?.forEach(card => {
        card.is_exhausted = false;
        card.attacked_this_turn = false;
      });
    });

    // 6️⃣ Robar carta: el decremento de deck_count y los eventos ALLY_DREW_CARD /
    //    OPPONENT_DREW_CARD los maneja TurnManager vía drawCardState().
    //    TurnRulesEngine no decrementaba físicamente la carta — solo el contador.
    //    Ese paso se movió a DrawCardAction para centralizar la lógica y los eventos.

    // Actualizar timestamp
    dotCtx.state.updated_at = Date.now();

    return { newState: dotCtx.state };
  }

  /**
   * (FUTURO) Simulación: ¿Qué pasaría si termino el turno?
   * Útil para IA, validación offline, etc.
   * 
   * Por ahora es igual a endTurn, pero permitirá lógica más compleja
   */
  static simulateEndTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string; simulatedState?: GameState } {
    // Primero validar
    const validation = this.validateEndTurn(state, playerNumber);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }

    // Luego ejecutar
    const result = this.endTurn(state, playerNumber);
    return { valid: true, simulatedState: result.newState };
  }
}
