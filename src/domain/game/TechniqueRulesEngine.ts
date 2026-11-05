/**
 * TechniqueRulesEngine.ts
 *
 * Lógica pura del sistema de Technique Attack (TA).
 *
 * Responsabilidades:
 * ✅ Validar TA (caballero, técnica, compatibilidad, cosmos suficiente)
 * ✅ Calcular daño multi-hit según modo defensivo
 * ✅ Aplicar efectos del atacante (ta_* side-effects)
 * ✅ Emitir eventos TA_DEALT / TA_RECEIVED / ATTACK_CONNECTED
 * ✅ Marcar caballero como exhausto tras el TA
 * ✅ Ejecutar cambios sin mutación (immutable sobre GameState clonado)
 *
 * Reglas clave (de GameDesign.md):
 * - Modo Evasión del defensor NO aplica a TA (solo a BA).
 * - Modo Defensa DEL defensor SÍ reduce daño (floor(hit_ce/2) por golpe).
 * - ta_ignore_block_mode (estado) o ignore_defense_mode (técnica): cancelan el Modo Defensa.
 * - Costo CP se deduce de la carta caballero (current_cosmos), no del jugador.
 * - Multi-hit: hit_count golpes independientes de max(1, hit_ce - ar).
 * - target_all: los golpes y ta_effects se aplican a cada caballero rival; los ta_* del
 *   atacante (Dark Effects) solo al objetivo principal (el indicado, o el primero).
 *
 * 100% puro: sin await, sin BD, sin side effects
 */

import { GameState, CardInGameState, Player, resolveWinCondition } from './GameState';
import {
  StatusEffect,
  StatusEffectType,
  IMMOBILIZE_DEFAULT_TURNS,
  isImmobilized,
  isStatusBlocked,
  addOrRefreshEffect,
  attackerTaIgnoresBlockMode,
  consumeTechniqueAttackEffects,
  getActiveTaModifiers,
  getTechniqueAttackEffectRule,
  isModeEffectType,
  deriveModeFromEffects,
} from './StatusEffects';
import { createEngineContext } from './EngineContext';
import { applyDamage } from './actions/DamageAction';
import { createEvent, GameEventType } from './events/GameEvents';
import type { GameEvent } from './events/GameEvents';
import { applyTechniqueSemanticEffect } from './technique/TechniqueEffectRegistry';
import { isOpeningTurn, OPENING_TURN_DIRECT_ATTACK_ERROR } from './rules/opening-turn.rules';

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/** Efecto inherente de la técnica que se aplica al defensor cuando el TA conecta. */
export interface TaEffect {
  /**
   * StatusEffectType a aplicar al defensor, o 'remove_mode' para quitarle el
   * Modo Defensa/Evasión (queda en modo normal).
   */
  type: string;
  /** Valor del efecto (e.g., daño por turno para burn/poison). */
  value?: number;
  /** Duración en turnos (remaining_turns). */
  turns?: number;
}

/** Stats de combate de una carta 'technique'. Cargados desde card_techniques por el Manager. */
export interface TechniqueStats {
  hit_count: number;
  hit_ce: number;
  ta_cost: number;
  compatible_tags: string[];
  /** Si true: el TA ignora la AR del defensor y cualquier reducción de Modo Defensa. */
  ignore_ar?: boolean;
  /** Si true: el Modo Defensa del defensor no reduce el daño (la AR sí cuenta). */
  ignore_defense_mode?: boolean;
  /** Si true: golpea a todos los caballeros rivales; el defensor indicado es solo el principal. */
  target_all?: boolean;
  /** Efectos inherentes de la técnica aplicados al defensor al conectar el TA. */
  ta_effects?: TaEffect[];
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class TechniqueRulesEngine {
  // ─── Helpers privados ─────────────────────────────────────────────────────

  private static _validateTurnAndPhase(
    state: GameState,
    playerNumber: 1 | 2,
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
        error: `Fase inválida para declarar TA: ${state.phase}`,
      };
    }
    return { valid: true };
  }

  private static _findInKnights(player: Player, cardId: string): CardInGameState | null {
    return player.field_knights.find(c => c.instance_id === cardId) ?? null;
  }

  private static _findInTechniques(player: Player, cardId: string): CardInGameState | null {
    return player.field_techniques.find(c => c.instance_id === cardId) ?? null;
  }

  private static _findInOpponentKnights(
    state: GameState,
    playerNumber: 1 | 2,
    cardId: string,
  ): CardInGameState | null {
    const opp = playerNumber === 1 ? state.player2 : state.player1;
    return opp.field_knights.find(c => c.instance_id === cardId) ?? null;
  }

  private static _applyStatusByRule(
    target: CardInGameState,
    statusType: StatusEffectType,
    sourceCardId: string,
    playerNumber: 1 | 2,
  ): void {
    if (isStatusBlocked(target.status_effects ?? [], statusType)) return;
    // Valores por defecto para efectos negativos de TA.
    const defaults: Partial<Record<StatusEffectType, { turns: number; value?: number }>> = {
      paralyzed: { turns: IMMOBILIZE_DEFAULT_TURNS },
      frozen:    { turns: IMMOBILIZE_DEFAULT_TURNS },
      poison:    { turns: 3, value: 1 },
      burn:      { turns: 3, value: 2 },
    };
    const d = defaults[statusType] ?? { turns: 1 };
    target.status_effects = addOrRefreshEffect(target.status_effects ?? [], {
      type: statusType,
      remaining_turns: d.turns,
      ...(d.value !== undefined ? { value: d.value } : {}),
      source: { card_instance_id: sourceCardId, player: playerNumber, type: 'passive' },
    });
  }

  /** Efectos inherentes de la técnica (technique_stats.ta_effects) sobre un defensor. */
  private static _applyTaEffects(
    defender: CardInGameState,
    taEffects: TaEffect[],
    knightCardId: string,
    playerNumber: 1 | 2,
  ): void {
    for (const eff of taEffects) {
      if (eff.type === 'remove_mode') {
        // La técnica saca al defensor de su Modo Defensa/Evasión
        defender.status_effects = (defender.status_effects ?? [])
          .filter(e => !isModeEffectType(e.type));
        defender.mode = deriveModeFromEffects(defender.status_effects);
        continue;
      }
      if (isStatusBlocked(defender.status_effects ?? [], eff.type)) continue;
      const immobilizes = eff.type === 'frozen' || eff.type === 'paralyzed';
      defender.status_effects = addOrRefreshEffect(
        defender.status_effects ?? [],
        {
          type: eff.type as StatusEffectType,
          remaining_turns: eff.turns ?? (immobilizes ? IMMOBILIZE_DEFAULT_TURNS : 1),
          ...(eff.value !== undefined ? { value: eff.value } : {}),
          source: { card_instance_id: knightCardId, player: playerNumber, type: 'technique' },
        },
      );
    }
  }

  private static _applyTechniqueModifiers(params: {
    activeEffects: StatusEffect[];
    knight: CardInGameState;
    defenderCard: CardInGameState | null;
    defenderPlayer: Player;
    playerNumber: 1 | 2;
  }): void {
    const { activeEffects, knight, defenderCard, defenderPlayer, playerNumber } = params;
    for (const effect of activeEffects) {
      const rule = getTechniqueAttackEffectRule(effect.type);
      if (!rule) continue;

      // Declarativo: si la regla define estado objetivo, se aplica sin hardcode por tipo.
      if (rule.applyToTarget && defenderCard) {
        this._applyStatusByRule(defenderCard, rule.applyToTarget, knight.instance_id, playerNumber);
      }

      applyTechniqueSemanticEffect({
        effect,
        knight,
        defenderCard,
        defenderPlayer,
        playerNumber,
        applyStatusToDefender: (statusType) => {
          if (!defenderCard) return;
          this._applyStatusByRule(defenderCard, statusType, knight.instance_id, playerNumber);
        },
      });
    }
  }

  // ─── Validación ──────────────────────────────────────────────────────────

  /**
   * Valida que la acción TA sea posible.
   * @param defenderCardId  null → ataque directo al jugador
   */
  static validateTechniqueAttack(
    state: GameState,
    playerNumber: 1 | 2,
    knightCardId: string,
    techniqueCardId: string,
    defenderCardId: string | null,
    stats: TechniqueStats,
  ): { valid: boolean; error?: string } {
    // 1. Turno y fase
    const turnCheck = this._validateTurnAndPhase(state, playerNumber);
    if (!turnCheck.valid) return turnCheck;

    const player = playerNumber === 1 ? state.player1 : state.player2;

    // 2. Caballero existe en campo del jugador
    const knight = this._findInKnights(player, knightCardId);
    if (!knight) return { valid: false, error: 'Caballero no encontrado en campo' };

    // 3. Caballero no exhausto
    if (knight.is_exhausted) return { valid: false, error: 'El caballero está exhausto' };

    // 4. Caballero no inmovilizado
    if (isImmobilized(knight.status_effects ?? [])) {
      return { valid: false, error: 'El caballero está inmovilizado y no puede atacar este turno' };
    }

    // 5. Técnica existe en campo_technique del mismo jugador
    const technique = this._findInTechniques(player, techniqueCardId);
    if (!technique) return { valid: false, error: 'Técnica no encontrada en campo de técnicas' };

    // 6. Compatibilidad: técnica.compatible_tags ∩ knight.tags ≠ ∅
    const knightTags = knight.tags ?? [];
    const isCompatible = stats.compatible_tags.some(tag => knightTags.includes(tag));
    if (!isCompatible) {
      return {
        valid: false,
        error: `La técnica no es compatible con este caballero. Compatible con: [${stats.compatible_tags.join(', ')}]`,
      };
    }

    // 7. Cosmos suficiente en la carta caballero
    if ((knight.current_cosmos ?? 0) < stats.ta_cost) {
      return {
        valid: false,
        error: `El caballero no tiene cosmos suficiente para este TA (necesita ${stats.ta_cost}, tiene ${knight.current_cosmos})`,
      };
    }

    // 8. Defensor (si especificado) existe en campo del oponente
    if (defenderCardId !== null) {
      const defender = this._findInOpponentKnights(state, playerNumber, defenderCardId);
      if (!defender) {
        return { valid: false, error: 'Carta defensora no encontrada en campo del oponente' };
      }
    }

    // 9. Primer turno de la partida: no se puede golpear al jugador rival.
    //    La TA es directa si no hay objetivos (sin defensor, o target_all sin caballeros rivales).
    const opponent = playerNumber === 1 ? state.player2 : state.player1;
    const hitsPlayerDirectly = stats.target_all ? opponent.field_knights.length === 0 : defenderCardId === null;
    if (hitsPlayerDirectly && isOpeningTurn(state)) {
      return { valid: false, error: OPENING_TURN_DIRECT_ATTACK_ERROR };
    }

    return { valid: true };
  }

  // ─── Ejecución ────────────────────────────────────────────────────────────

  /**
   * Ejecuta un Technique Attack.
   * @param defenderCardId  null → daño directo al jugador (2 DIP, igual que BA directo)
   */
  static techniqueAttack(
    state: GameState,
    playerNumber: 1 | 2,
    knightCardId: string,
    techniqueCardId: string,
    defenderCardId: string | null,
    stats: TechniqueStats,
  ): {
    newState: GameState;
    totalDamage: number;
    hitCount: number;
    events: GameEvent[];
  } {
    const engineCtx = createEngineContext(state);
    const attackerPlayer = playerNumber === 1 ? engineCtx.state.player1 : engineCtx.state.player2;
    const defenderPlayer = playerNumber === 1 ? engineCtx.state.player2 : engineCtx.state.player1;
    const defenderPlayerNumber: 1 | 2 = playerNumber === 1 ? 2 : 1;

    const knight = this._findInKnights(attackerPlayer, knightCardId)!;

    // ─ 1. Consumir CP del caballero ──────────────────────────────────────────
    knight.current_cosmos = Math.max(0, (knight.current_cosmos ?? 0) - stats.ta_cost);

    // ─ 2. Calcular daño por hit ──────────────────────────────────────────────
    let totalDamage         = 0;
    let damageToPlayer      = 0;
    const attackerEffects   = knight.status_effects ?? [];
    const ignoreBlock       = stats.ignore_defense_mode === true || attackerTaIgnoresBlockMode(attackerEffects);

    // Objetivos: todos los rivales (target_all) o el defensor indicado. Sin objetivos → ataque directo.
    const targetIds: string[] = stats.target_all
      ? defenderPlayer.field_knights.map(c => c.instance_id)
      : (defenderCardId ? [defenderCardId] : []);
    const primaryId: string | null = targetIds.length === 0
      ? null
      : (defenderCardId && targetIds.includes(defenderCardId) ? defenderCardId : targetIds[0]);
    const damageByTarget = new Map<string, number>();

    if (targetIds.length === 0) {
      // Ataque directo al jugador: misma regla que BA directo
      damageToPlayer = 2;
    }

    for (const targetId of targetIds) {
      const defender = defenderPlayer.field_knights.find(c => c.instance_id === targetId);
      if (!defender) continue;

      // Modo Evasión NO se aplica a TA (regla de diseño).
      // Modo Defensa SÍ reduce daño (salvo ta_ignore_block_mode o ignore_defense_mode).
      const defenderMode = defender.mode ?? 'normal';
      const effectiveMode: 'normal' | 'defense' =
        (defenderMode === 'defense' && !ignoreBlock) ? 'defense' : 'normal';

      let dealt = 0;
      for (let i = 0; i < stats.hit_count; i++) {
        const hitDamage = stats.ignore_ar
          // Daño directo: ignora AR y la reducción de Modo Defensa.
          ? Math.max(0, stats.hit_ce)
          : Math.max(1, (effectiveMode === 'defense' ? Math.floor(stats.hit_ce / 2) : stats.hit_ce) - (defender.ar ?? 0));
        dealt += hitDamage;
        // Aplicar daño de golpe individual
        applyDamage(engineCtx, targetId, hitDamage, knightCardId);
        // Si la carta muere a mitad de multi-hit, los golpes restantes se abortan
        const stillAlive = defenderPlayer.field_knights.find(c => c.instance_id === targetId);
        if (!stillAlive) {
          // Al morir genera 1 DIP
          damageToPlayer += 1;
          break;
        }
      }
      damageByTarget.set(targetId, dealt);
      totalDamage += dealt;
    }

    // ─ 3. Detectar ta_* side-effects ANTES de consumirlos ───────────────────
    const activeTaMods = getActiveTaModifiers(attackerEffects);

    // ─ 4. Emitir eventos de ataque ───────────────────────────────────────────
    engineCtx.bus.emit(
      createEvent({
        type: 'ATTACK_CONNECTED',
        playerNumber,
        sourceCardId: knightCardId,
        ...(primaryId ? { targetCardId: primaryId } : {}),
        origin: 'player',
        payload: {
          attack_type: 'TA',
          damage_to_card: totalDamage,
          damage_to_player: damageToPlayer,
          technique_card_id: techniqueCardId,
          hit_count: stats.hit_count,
          ...(primaryId ? { defender_card_id: primaryId } : {}),
        },
      }),
    );

    // TA_DEALT — perspectiva del atacante
    engineCtx.bus.emit(
      createEvent({
        type: GameEventType.TA_DEALT,
        playerNumber,
        sourceCardId: knightCardId,
        ...(primaryId ? { targetCardId: primaryId } : {}),
        origin: 'system',
        payload: {
          attack_type: 'TA' as const,
          total_damage: totalDamage,
          hit_count: stats.hit_count,
          attacker_card_id: knightCardId,
          technique_card_id: techniqueCardId,
          ...(primaryId ? { defender_card_id: primaryId } : {}),
        },
      }),
    );

    // TA_RECEIVED — perspectiva de cada defensor golpeado
    for (const [targetId, dealt] of damageByTarget) {
      engineCtx.bus.emit(
        createEvent({
          type: GameEventType.TA_RECEIVED,
          playerNumber: defenderPlayerNumber,
          sourceCardId: targetId,
          targetCardId: knightCardId,
          origin: 'system',
          payload: {
            attack_type: 'TA' as const,
            total_damage: dealt,
            hit_count: stats.hit_count,
            attacker_card_id: knightCardId,
            technique_card_id: techniqueCardId,
            defender_card_id: targetId,
          },
        }),
      );
    }

    // ─ 5. Aplicar DIP al jugador defensor ───────────────────────────────────
    defenderPlayer.life = Math.max(0, defenderPlayer.life - damageToPlayer);

    // ─ 5.5. Aplicar efectos inherentes de la técnica (ta_effects) ────────────
    // Estos efectos vienen de technique_stats en DB y aplican independientemente
    // de los ta_* status effects del caballero. Con target_all, a cada rival golpeado que siga vivo.
    if (stats.ta_effects && stats.ta_effects.length > 0) {
      for (const targetId of targetIds) {
        const defenderForTaEffects = defenderPlayer.field_knights.find(c => c.instance_id === targetId);
        if (defenderForTaEffects) this._applyTaEffects(defenderForTaEffects, stats.ta_effects, knightCardId, playerNumber);
      }
    }

    // ─ 6. Aplicar ta_* side-effects (declarativo + semántico) ───────────────
    const defenderAfter = primaryId
      ? defenderPlayer.field_knights.find(c => c.instance_id === primaryId) ?? null
      : null;
    this._applyTechniqueModifiers({
      activeEffects: activeTaMods,
      knight,
      defenderCard: defenderAfter,
      defenderPlayer,
      playerNumber,
    });

    // ─ 7. Consumir efectos ta_* one-shot del atacante ─────────────────────────
    knight.status_effects = consumeTechniqueAttackEffects(knight.status_effects ?? []);

    // ─ 8. Marcar caballero como exhausto ────────────────────────────────────
    knight.is_exhausted       = true;
    knight.attacked_this_turn = true;

    resolveWinCondition(engineCtx.state);

    return {
      newState:    engineCtx.state,
      totalDamage,
      hitCount:    stats.hit_count,
      events:      [...engineCtx.bus.events],
    };
  }
}
