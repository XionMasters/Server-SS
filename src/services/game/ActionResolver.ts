/**
 * ActionResolver.ts
 *
 * Calcula qué acciones puede realizar cada carta del jugador activo en este momento.
 * El resultado se incluye en el broadcast `match_update` → el cliente NUNCA calcula reglas.
 *
 * DISEÑO:
 * ─ Solo calcula para el jugador activo (current_player).  El inactivo recibe valid_actions = null.
 * ─ Sin acceso a BD: trabaja únicamente con los arrays de cartas y el estado del match.
 * ─ Las habilidades activas de carta viven en `src/game/abilities/`.
 *   ActionResolver NUNCA conoce habilidades individuales: delega en AbilityRegistry.
 *
 * FLUJO:
 *   matchesCoordinator → ActionResolver.resolve(cards, matchState) → cards enriquecidas
 *
 * AGREGAR UNA HABILIDAD NUEVA:
 *   1. Crear src/game/abilities/mi_habilidad.ability.ts
 *   2. Importarla en AbilityRegistry.ts
 *   → Este archivo no se toca.
 */
import { ResolvedAbility } from '../../game/abilities/AbilityTypes';
import { AbilityEngine } from '../../engine/abilities/AbilityEngine';
import { parseAbilityDef, getCosmosCost, requiresClientTarget } from '../../engine/abilities/AbilityDefinition';
import { type ConditionContext } from '../../engine/conditions/ConditionRegistry';
import { GameEventType, type GameEvent } from '../../engine/events/GameEvents';
// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

/** Acciones válidas para un caballero en campo */
export interface KnightValidActions {
  has_acted: boolean;

  can_attack: boolean;
  /** null = no puede atacar | [] = ataque directo | [ids] = targets obligatorios */
  attack_targets: string[] | null;

  can_move: boolean;
  /** Índices de slots propios vacíos a los que puede moverse */
  move_targets: number[];

  can_charge: boolean;   // Carregar Cosmo
  can_evade: boolean;    // Modo Evasão
  can_defend: boolean;   // Modo Defesa
  can_sacrifice: boolean;

  /** Habilidades activas de carta disponibles */
  can_use_ability: boolean;
  /** Lista de habilidades activas disponibles con nombre y costo en CP */
  active_abilities: { ability_name: string; cosmos_cost: number }[];

  /** Para más adelante — siempre false hasta implementar */
  can_use_technique: boolean;
  technique_targets: string[];
}

/** Acciones válidas para una carta en mano */
export interface HandCardValidActions {
  can_play: boolean;
  /** Índices de slot en los que se puede jugar esta carta */
  play_slots: number[];
}

export type ValidActions = KnightValidActions | HandCardValidActions | null;

// ─────────────────────────────────────────────────────────────────────────────
// CLASE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export class ActionResolver {
  /**
   * Punto de entrada.
   * Recibe el array cards_in_play serializado y el estado del match,
   * devuelve el mismo array con `valid_actions` inyectado en cada carta del jugador activo.
   */
  static resolve(cardsInPlay: any[], matchState: any): any[] {
    const activePlayer: number = matchState.current_player || 1;

    // Pre-índices que usan múltiples métodos → calcular una sola vez
    const opponentKnights = cardsInPlay.filter(
      c => c.player_number !== activePlayer && c.zone === 'field_knight'
    );
    const ownKnightPositions = new Set<number>(
      cardsInPlay
        .filter(c => c.player_number === activePlayer && c.zone === 'field_knight')
        .map(c => c.position)
    );
    const emptyKnightSlots = [0, 1, 2, 3, 4].filter(i => !ownKnightPositions.has(i));

    return cardsInPlay.map(card => {
      // Jugador inactivo → no calcula nada
      if (card.player_number !== activePlayer) {
        return { ...card, valid_actions: null };
      }

      if (card.zone === 'field_knight') {
        return {
          ...card,
          valid_actions: this._knightActions(
            card,
            opponentKnights,
            emptyKnightSlots,
            matchState
          )
        };
      }

      if (card.zone === 'hand') {
        return {
          ...card,
          valid_actions: this._handCardActions(card, cardsInPlay, activePlayer, matchState)
        };
      }

      // Otras zonas (field_technique, field_helper, etc.) → por implementar
      return { ...card, valid_actions: null };
    });
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // KNIGHT ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private static _knightActions(
    knight: any,
    opponentKnights: any[],
    emptySlots: number[],
    matchState: any
  ): KnightValidActions {
    const hasActed: boolean = knight.has_attacked_this_turn ?? false;
    const canActAtAll = !hasActed && (knight.can_attack_this_turn !== false);

    // Modo defensivo actual (string: 'normal' | 'defense' | 'evasion' | bool legacy)
    const currentMode: string = this._normalizeMode(knight.is_defensive_mode);

    const canAttack = canActAtAll;
    const attackTargets = canAttack
      ? this._resolveAttackTargets(opponentKnights)
      : null;

    // Move targets: solo casillas adyacentes (±1) que estén vacías
    const adjacentEmptySlots = emptySlots.filter(i => Math.abs(i - knight.position) === 1);
    const canMove = canActAtAll && adjacentEmptySlots.length > 0;
    const moveTargets = canMove ? adjacentEmptySlots : [];

    const canCharge   = canActAtAll;
    const canEvade    = canActAtAll
      && currentMode !== 'evasion'
      && this._noScenarioPreventsEvasion(matchState);
    const canDefend   = canActAtAll
      && currentMode !== 'defense'
      && (knight.card?.card_knight?.can_defend !== false);
    const canSacrifice = !hasActed; // El sacrificio siempre usa la acción del caballero

    // ── Habilidades activas ─────────────────────────────────────────────
    // Delegado al AbilityRegistry; este método no crece al agregar cartas nuevas.
    const activeAbilities = this._resolveAbilities(knight, matchState, opponentKnights);
    const canUseAbility = activeAbilities.length > 0;

    return {
      has_acted: hasActed,
      can_attack: canAttack,
      attack_targets: attackTargets,
      can_move: canMove,
      move_targets: moveTargets,
      can_charge: canCharge,
      can_evade: canEvade,
      can_defend: canDefend,
      can_sacrifice: canSacrifice,
      can_use_ability: canUseAbility,
      active_abilities: activeAbilities,
      // ─── Por implementar ───────────────────────────────────────────────────
      can_use_technique: false,
      technique_targets: [],
    };
  }

  /**
   * Resuelve qué knights rivales son objetivos de ataque válidos.
   *
   *   [] (array vacío)  → ataque directo permitido (no hay knights en campo rival)
   *   [ids]             → solo estos son objetivos válidos
   *
   * FUTURO — Habilidad "Defensor/Taunt":
   *   const defenders = opponents.filter(k => k.card?.abilities?.includes('defender'));
   *   if (defenders.length > 0) return defenders.map(k => k.id);
   */
  private static _resolveAttackTargets(opponentKnights: any[]): string[] {
    if (opponentKnights.length === 0) return []; // ataque directo

    // TODO: filtrar por habilidad "Defensor"
    return opponentKnights.map(k => k.id);
  }

  /**
   * Verifica si el escenario activo impide la evasión.
   *
   * FUTURO:
   *   const scenario = matchState.cards_in_play?.find(c => c.zone === 'field_scenario');
   *   return scenario?.card?.abilities?.prevents_evasion !== true;
   */
  private static _noScenarioPreventsEvasion(_matchState: any): boolean {
    return true; // Sin restricciones por ahora
  }

  /** Normaliza is_defensive_mode (puede llegar como bool legacy o string) */
  private static _normalizeMode(raw: any): string {
    if (!raw || raw === false) return 'normal';
    if (raw === true)           return 'defense'; // legacy bool
    return String(raw);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ABILITY RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evalúa qué habilidades activas del caballero están disponibles en este momento.
   * Lee las definiciones desde card_abilities.effects (JSONB) y delega a AbilityEngine.
   * No hay lógica específica de cartas aquí — todo viene del JSONB en BD.
   */
  private static _resolveAbilities(
    knight: any,
    matchState: any,
    _opponentKnights: any[]
  ): ResolvedAbility[] {
    const result: ResolvedAbility[] = [];
    const abilities: any[] = knight.card?.card_abilities ?? [];

    for (const raw of abilities) {
      if (raw.type !== 'activa') continue;

      const def = parseAbilityDef(raw.effects);
      if (!def) continue;

      const statusEffects = (() => {
        try { return JSON.parse(knight.status_effects ?? '[]'); }
        catch { return []; }
      })();

      const hand: any[] = matchState[`player${knight.player_number}_hand`] ?? [];

      const event: GameEvent = {
        type: GameEventType.ACTIVE,
        playerNumber: knight.player_number as 1 | 2,
        sourceCardId: knight.id,
      };

      const ctx: ConditionContext = {
        sourceCard: {
          status_effects: statusEffects,
          current_cosmos: knight.current_cosmos ?? 0,
          zone: knight.zone,
        },
        player: {
          hand,
          field_knights: [],
        },
        event,
      };

      const check = AbilityEngine.canActivateFromContext(def, ctx, event);
      if (check.valid) {
        result.push({
          ability_name: (raw.name as string).toLowerCase().replace(/\s+/g, '_'),
          cosmos_cost: getCosmosCost(def),
          ...(requiresClientTarget(def) ? { requires_target: true } : {}),
        });
      }
    }

    return result;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // HAND CARD ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  private static _handCardActions(
    card: any,
    cardsInPlay: any[],
    playerNumber: number,
    matchState: any
  ): HandCardValidActions {
    const cosmos: number = matchState[`player${playerNumber}_cosmos`] ?? 0;
    const cardCost: number = card.card?.cost ?? 0;

    if (cosmos < cardCost) {
      return { can_play: false, play_slots: [] };
    }

    const cardType: string = card.card?.type ?? '';
    const playSlots = this._getPlaySlots(cardType, playerNumber, cardsInPlay);

    return {
      can_play: playSlots.length > 0,
      play_slots: playSlots,
    };
  }

  /**
   * Devuelve los índices de slot en los que se puede jugar una carta según su tipo.
   *
   * FUTURO — Habilidad "Solo en slot 1 (Panzón)":
   *   case 'knight': return this._filterByCardAbilities(carta, slotsVacios);
   */
  private static _getPlaySlots(
    cardType: string,
    playerNumber: number,
    cardsInPlay: any[]
  ): number[] {
    switch (cardType) {
      case 'knight': {
        const occupied = this._occupiedPositions(cardsInPlay, playerNumber, 'field_knight');
        return [0, 1, 2, 3, 4].filter(i => !occupied.has(i));
      }

      case 'technique': {
        const occupied = this._occupiedPositions(cardsInPlay, playerNumber, 'field_technique');
        return [0, 1, 2, 3, 4].filter(i => !occupied.has(i));
      }

      case 'helper': {
        const hasHelper = cardsInPlay.some(
          c => c.player_number === playerNumber && c.zone === 'field_helper'
        );
        return hasHelper ? [] : [0];
      }

      case 'event':    // "occasion" en servidor
      case 'occasion': {
        // Eventos/ocasiones: slot único por jugador, efecto inmediato y descarte.
        const hasOccasion = cardsInPlay.some(
          c => c.player_number === playerNumber && c.zone === 'field_occasion'
        );
        return hasOccasion ? [] : [0];
      }

      case 'item': {
        // Objetos/equipamiento: comparten los 5 slots de la fila de técnicas.
        // Son permanentes; se asocian al caballero en el mismo slot (misma posición).
        // Si el caballero muere, el objeto pasa al yomotsu (TODO: implementar en KnightManager).
        const occupied = this._occupiedPositions(cardsInPlay, playerNumber, 'field_technique');
        return [0, 1, 2, 3, 4].filter(i => !occupied.has(i));
      }

      case 'stage': {
        const hasScenario = cardsInPlay.some(c => c.zone === 'field_scenario');
        return hasScenario ? [] : [0];
      }

      default:
        return [];
    }
  }

  // ─── Utilidades ────────────────────────────────────────────────────────────

  private static _occupiedPositions(
    cardsInPlay: any[],
    playerNumber: number,
    zone: string
  ): Set<number> {
    return new Set(
      cardsInPlay
        .filter(c => c.player_number === playerNumber && c.zone === zone)
        .map(c => c.position)
    );
  }
}
