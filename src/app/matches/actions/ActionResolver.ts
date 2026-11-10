/**
 * ActionResolver.ts
 *
 * Calcula qué acciones puede realizar cada carta del jugador activo en este momento.
 * El resultado se incluye en el broadcast `match_update` → el cliente NUNCA calcula reglas.
 *
 * DISEÑO:
 * ─ Solo calcula para el jugador activo (current_player).  El inactivo recibe valid_actions = null.
 * ─ Sin acceso a BD: trabaja únicamente con los arrays de cartas y el estado del match.
 * ─ Las habilidades son datos (card_abilities) interpretados por AbilityEngine:
 *   ActionResolver nunca conoce habilidades individuales.
 *
 * FLUJO:
 *   matchesCoordinator → ActionResolver.resolve(cards, matchState) → cards enriquecidas
 */
import { AbilityEngine } from '../../../domain/game/abilities/AbilityEngine';
import { parseAbilityDef, getCosmosCost, requiresClientTarget } from '../../../domain/game/abilities/AbilityDefinition';
import { type ConditionContext, type PlayerRef } from '../../../domain/game/conditions/ConditionRegistry';
import { parseStatusEffects, getTauntingKnights, isAbilityUsedThisTurn, isImmobilized } from '../../../domain/game/StatusEffects';
import { findUniqueConflict } from '../../../domain/game/rules/unique.rules';
import { isOpeningTurn } from '../../../domain/game/rules/opening-turn.rules';
import { isPlayerCosmosFull } from '../../../domain/game/rules/cosmos.rules';
import { GameEventType, type GameEvent } from '../../../domain/game/events/GameEvents';
import { ZoneMapper } from '../../../domain/game/ZoneMapper';
import { normalizeCardType, playZoneForType } from '../../../domain/game/CardTypes';
import { equipEligibleKnights } from '../../../domain/game/rules/equipment.rules';
import { canPlayKnightThisTurn, readKnightPlayCounters } from '../../../domain/game/rules/knight-play.rules';
// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

/** Forma serializada de una habilidad activa que recibe el cliente. */
export interface ResolvedAbility {
  ability_name: string;
  cosmos_cost: number;
  /** Si true, el cliente debe mostrar un selector de objetivo antes de confirmar. */
  requires_target?: boolean;
}

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

  can_use_technique: boolean;
  technique_targets: string[];
  /** Técnicas propias en juego que este caballero puede usar ahora */
  techniques: UsableTechnique[];
}

/** Técnica utilizable por un caballero (acción TECHNIQUE_ATTACK). */
export interface UsableTechnique {
  technique_id: string;
  name: string;
  ta_cost: number;
  /** Golpea a todos los rivales: el cliente no pide objetivo */
  target_all: boolean;
}

/** Acciones válidas para una carta en mano */
export interface HandCardValidActions {
  can_play: boolean;
  /** Índices de slot en los que se puede jugar esta carta */
  play_slots: number[];
  /** Zona (notación cliente) a la que va la carta: field_knight, field_technique, field_scenario… */
  play_zone?: string;
  /**
   * Solo objetos: instance_ids de los caballeros propios a los que se puede equipar
   * (rules/equipment.rules.ts). El cliente envía el elegido como equip_target_id en PLAY_CARD.
   */
  equip_targets?: string[];
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
            cardsInPlay,
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
    cardsInPlay: any[],
    matchState: any
  ): KnightValidActions {
    const hasActed: boolean = knight.has_attacked_this_turn ?? false;
    const canActAtAll = !hasActed && (knight.can_attack_this_turn !== false);

    // Modo defensivo actual (string: 'normal' | 'defense' | 'evasion' | bool legacy)
    const currentMode: string = this._normalizeMode(knight.is_defensive_mode);

    // Congelado/paralizado: no puede atacar ni usar técnicas (AttackRulesEngine / TechniqueRulesEngine)
    const immobilized = isImmobilized(parseStatusEffects(knight.status_effects));
    // Primer turno de la partida: sin caballeros rivales el ataque sería directo, y no se permite
    const directAttackBlocked = opponentKnights.length === 0 && isOpeningTurn({
      current_turn: Number(matchState.current_turn),
      current_player: Number(matchState.current_player) as 1 | 2,
      first_player: matchState.first_player,
    });
    const canAttack = canActAtAll && !immobilized && !directAttackBlocked;
    const attackTargets = canAttack
      ? this._resolveAttackTargets(opponentKnights, true)
      : null;

    // Move targets: solo casillas adyacentes (±1) que estén vacías
    const adjacentEmptySlots = emptySlots.filter(i => Math.abs(i - knight.position) === 1);
    const canMove = canActAtAll && adjacentEmptySlots.length > 0;
    const moveTargets = canMove ? adjacentEmptySlots : [];

    // Cargar Cosmo no sirve si el cosmo del jugador ya está al máximo
    const playerCosmos = knight.player_number === 1 ? matchState.player1_cosmos : matchState.player2_cosmos;
    const canCharge   = canActAtAll && !isPlayerCosmosFull(playerCosmos);
    const canEvade    = canActAtAll
      && currentMode !== 'evasion'
      && this._noScenarioPreventsEvasion(matchState);
    const canDefend   = canActAtAll
      && currentMode !== 'defense'
      && (this._getCardPayload(knight)?.card_knight?.can_defend !== false);
    const canSacrifice = !hasActed; // El sacrificio siempre usa la acción del caballero

    const ownTechniques = cardsInPlay.filter(
      c => c.player_number === knight.player_number && ZoneMapper.isSupportZone(c.zone)
    );
    const knightTags: string[] = this._getCardPayload(knight)?.tags ?? [];
    const compatibleTechniques = ownTechniques.filter(t => {
      const tStats = this._getCardPayload(t)?.card_technique;
      if (!tStats) return false;
      const compatibleTags: string[] = tStats.compatible_tags ?? [];
      const taCost: number = tStats.ta_cost ?? 0;
      if ((knight.current_cosmos ?? 0) < taCost) return false;
      return compatibleTags.some(tag => knightTags.includes(tag));
    });
    // Sin caballeros rivales toda TA sería directa: en el primer turno no se permite
    const canUseTechnique = canActAtAll && !immobilized && !directAttackBlocked && compatibleTechniques.length > 0;
    const techniques: UsableTechnique[] = canUseTechnique
      ? compatibleTechniques.map(t => {
          const payload = this._getCardPayload(t);
          return {
            technique_id: t.id,
            name: payload?.name ?? '',
            ta_cost: payload?.card_technique?.ta_cost ?? 0,
            target_all: payload?.card_technique?.target_all === true,
          };
        })
      : [];
    const techniqueTargets = canUseTechnique ? this._resolveAttackTargets(opponentKnights) : [];

    // ── Habilidades activas ─────────────────────────────────────────────
    // Delegado al AbilityRegistry; este método no crece al agregar cartas nuevas.
    const activeAbilities = this._resolveAbilities(knight, matchState, cardsInPlay);
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
      can_use_technique: canUseTechnique,
      technique_targets: techniqueTargets,
      techniques,
    };
  }

  /**
   * Resuelve qué knights rivales son objetivos de ataque válidos.
   *
   *   [] (array vacío)  → ataque directo permitido (no hay knights en campo rival)
   *   [ids]             → solo estos son objetivos válidos
   *
   * Con `respectTaunt` (BA), si algún rival tiene Provocación solo él es objetivo.
   * Las TA no están obligadas por la Provocación.
   */
  private static _resolveAttackTargets(opponentKnights: any[], respectTaunt = false): string[] {
    if (opponentKnights.length === 0) return []; // ataque directo

    if (respectTaunt) {
      const withEffects = opponentKnights.map(k => ({ id: k.id, status_effects: parseStatusEffects(k.status_effects) }));
      const taunting = getTauntingKnights(withEffects);
      if (taunting.length > 0) return taunting.map(k => k.id);
    }
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
    cardsInPlay: any[]
  ): ResolvedAbility[] {
    const result: ResolvedAbility[] = [];
    const abilities: any[] = this._getCardPayload(knight)?.abilities ?? knight.card?.card_abilities ?? [];
    const playerNumber = knight.player_number as 1 | 2;
    const knightEffects = parseStatusEffects(knight.status_effects);

    for (const raw of abilities) {
      if (raw.type !== 'activa') continue;
      // knightManager.useAbility busca por ability_key (fallback: nombre normalizado)
      const abilityKey: string = raw.ability_key ?? (raw.name as string).toLowerCase().replace(/\s+/g, '_');
      if (isAbilityUsedThisTurn(knightEffects, abilityKey)) continue;

      const def = parseAbilityDef(raw.effects);
      if (!def || def.trigger !== GameEventType.ACTIVE) continue;

      const event: GameEvent = {
        type: GameEventType.ACTIVE,
        playerNumber,
        sourceCardId: knight.id,
      };

      // Mismo contexto que construye AbilityEngine con el GameState completo,
      // para que lo ofrecido aquí coincida con lo que el servidor acepta después.
      const ctx: ConditionContext = {
        sourceCard: this._toCardRef(knight),
        player: this._toPlayerRef(cardsInPlay, matchState, playerNumber),
        opponent: this._toPlayerRef(cardsInPlay, matchState, playerNumber === 1 ? 2 : 1),
        playerNumber,
        event,
      };

      const check = AbilityEngine.canActivateFromContext(def, ctx, event);
      if (check.valid) {
        result.push({
          ability_name: abilityKey,
          cosmos_cost: getCosmosCost(def),
          ...(requiresClientTarget(def) ? { requires_target: true } : {}),
        });
      }
    }

    return result;
  }

  /** Carta serializada → referencia que entienden las condiciones (como CardInGameState). */
  private static _toCardRef(card: any): any {
    const payload = this._getCardPayload(card);
    return {
      instance_id: card.id,
      zone: card.zone,
      current_cosmos: card.current_cosmos ?? 0,
      current_health: card.current_health,
      status_effects: parseStatusEffects(card.status_effects),
      ce: card.current_attack,
      card_code: payload?.code,
      card_type: payload?.type,
      tags: payload?.tags ?? [],
    };
  }

  private static _toPlayerRef(cardsInPlay: any[], matchState: any, playerNumber: 1 | 2): PlayerRef {
    const own = cardsInPlay.filter(c => c.player_number === playerNumber);
    const inZone = (zone: string) => own.filter(c => c.zone === zone).map(c => this._toCardRef(c));
    return {
      hand: inZone('hand'),
      field_knights: inZone('field_knight'),
      graveyard: inZone('yomotsu'),
      life: matchState[`player${playerNumber}_life`],
      cosmos: matchState[`player${playerNumber}_cosmos`],
    };
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
    const cardCost: number = this._getCardPayload(card)?.cost ?? 0;

    if (cosmos < cardCost) {
      return { can_play: false, play_slots: [] };
    }

    const cardType: string = normalizeCardType(this._getCardPayload(card)?.type);
    if (cardType === 'knight' && this._uniqueBlocked(card, cardsInPlay, playerNumber)) {
      return { can_play: false, play_slots: [] };
    }
    // Un caballero por turno, salvo permisos extra de habilidades (rules/knight-play.rules.ts)
    if (cardType === 'knight'
      && !canPlayKnightThisTurn(readKnightPlayCounters(matchState.turn_counters, playerNumber as 1 | 2))) {
      return { can_play: false, play_slots: [] };
    }
    const playSlots = this._getPlaySlots(cardType, playerNumber, cardsInPlay);
    const playZone = playZoneForType(cardType);

    // Objetos: se juegan equipándolos a un caballero propio que cumpla su filtro
    if (cardType === 'object') {
      const payload = this._getCardPayload(card);
      const ownKnights = cardsInPlay
        .filter(c => c.player_number === playerNumber && c.zone === 'field_knight')
        .map(c => ({ ...this._toCardRef(c), card_type: normalizeCardType(this._getCardPayload(c)?.type) }));
      const equipTargets = equipEligibleKnights(payload?.abilities ?? card.card?.card_abilities ?? [], ownKnights)
        .map(k => k.instance_id);
      return {
        can_play: playSlots.length > 0 && equipTargets.length > 0,
        play_slots: playSlots,
        ...(playZone ? { play_zone: ZoneMapper.toClient(playZone) } : {}),
        equip_targets: equipTargets,
      };
    }

    return {
      can_play: playSlots.length > 0,
      play_slots: playSlots,
      ...(playZone ? { play_zone: ZoneMapper.toClient(playZone) } : {}),
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
        const occupied = this._occupiedSupportPositions(cardsInPlay, playerNumber);
        return [0, 1, 2, 3, 4].filter(i => !occupied.has(i));
      }

      case 'helper': {
        const hasHelper = cardsInPlay.some(
          c => c.player_number === playerNumber && c.zone === 'field_helper'
        );
        return hasHelper ? [] : [0];
      }

      case 'occasion': {
        // Eventos/ocasiones: slot único por jugador, efecto inmediato y descarte.
        const hasOccasion = cardsInPlay.some(
          c => c.player_number === playerNumber && c.zone === 'field_occasion'
        );
        return hasOccasion ? [] : [0];
      }

      case 'object': {
        // Objetos/equipamiento: comparten los 5 slots de la fila de técnicas.
        // Son permanentes y se equipan a un caballero propio (equip_targets en _handCardActions);
        // si el caballero sale del campo, el objeto va al yomotsu (releaseEquipment).
        const occupied = this._occupiedSupportPositions(cardsInPlay, playerNumber);
        return [0, 1, 2, 3, 4].filter(i => !occupied.has(i));
      }

      case 'stage': {
        // El escenario es compartido: si hay uno activo, se reemplaza.
        return [0];
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

  /**
   * Compatibilidad de zonas de soporte:
   * - Cliente/serializado: field_technique
   * - BD interna: field_support
   */
  private static _occupiedSupportPositions(
    cardsInPlay: any[],
    playerNumber: number
  ): Set<number> {
    return new Set(
      cardsInPlay
        .filter(
          c =>
            c.player_number === playerNumber
            && ZoneMapper.isSupportZone(c.zone)
        )
        .map(c => c.position)
    );
  }

  /** Carta única cuyo personaje ya está en el campo propio (misma regla que CardRulesEngine). */
  private static _uniqueBlocked(card: any, cardsInPlay: any[], playerNumber: number): boolean {
    const toRef = (c: any) => {
      const payload = this._getCardPayload(c);
      return { instance_id: c.id, card_code: payload?.code ?? '', character: payload?.character ?? null, unique: payload?.unique === true };
    };
    const ownKnights = cardsInPlay
      .filter(c => c.player_number === playerNumber && c.zone === 'field_knight')
      .map(toRef);
    return findUniqueConflict(ownKnights, toRef(card)) !== undefined;
  }

  private static _getCardPayload(card: any): any {
    return card?.base_data || card?.card || {};
  }
}
