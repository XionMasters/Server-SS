// src/app/matches/ai/aiDecision.ts
// Decide la siguiente jugada de la IA a partir del estado que recibe un jugador (match_update).
//
// Es lógica pura: no toca la base de datos ni conoce reglas propias. Solo elige entre lo que
// ActionResolver ya calculó como válido (valid_actions) y lo que pide pending_selection,
// igual que haría el cliente. Si una jugada falla, el llamador la añade a `failed` y la IA
// no la repite en ese turno.
//
// Prioridades de cada paso:
//   1. Resolver la selección pendiente que le toca.
//   2. Jugar cartas de la mano (caballeros > escenario > ayudante > técnicas usables > objetos > ocasiones).
//   3. Habilidades activas sin objetivo (no gastan la acción del caballero).
//   4. Acción de cada caballero: TA > BA (prefiere rematar) > Cargar Cosmo > Defensa.
//   5. Terminar el turno.

import { normalizeCardType } from '../../../domain/game/CardTypes';

export type AiMove =
  | { kind: 'action'; key: string; action: Record<string, any> }
  | { kind: 'selection'; key: string; selectionId: string; chosenCardId?: string; chosenSlot?: number }
  | { kind: 'wait' };

export const END_TURN_KEY = 'END_TURN';

/** Por debajo de este cosmo la IA prefiere cargar con los caballeros que pegan poco. */
const LOW_COSMOS = 6;

const PLAY_PRIORITY: Record<string, number> = {
  knight: 100,
  stage: 90,
  helper: 80,
  technique: 70,
  object: 60,
  occasion: 50,
};

const payloadOf = (card: any): any => card?.base_data || card?.card || {};
const typeOf = (card: any): string => normalizeCardType(payloadOf(card).type);
const num = (value: any, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Daño estimado de un BA: max(1, CE − AR), reducido si el defensor se protege. */
export function estimateBasicDamage(attacker: any, defender: any): number {
  const raw = Math.max(1, num(attacker?.current_attack) - num(defender?.current_defense));
  const mode = String(defender?.mode ?? defender?.is_defensive_mode ?? 'normal');
  if (mode === 'defense') return Math.max(1, Math.floor(raw * 0.5));
  if (mode === 'evasion') return raw * 0.5; // 50% de esquivar el BA
  return raw;
}

/** Elige objetivo: primero lo que se puede rematar (el más peligroso), si no, el que más daño recibe. */
function chooseTarget(attacker: any, targets: any[], damageOf: (t: any) => number): any | null {
  if (targets.length === 0) return null;
  const scored = targets.map(t => {
    const damage = damageOf(t);
    const health = num(t.current_health, 1);
    const kills = damage >= health;
    return { t, damage, health, kills, threat: num(t.current_attack) };
  });
  scored.sort((a, b) =>
    Number(b.kills) - Number(a.kills)
    || (a.kills ? b.threat - a.threat : 0)
    || b.damage - a.damage
    || a.health - b.health);
  return scored[0].t;
}

function decideSelection(state: any, botPlayer: number, failed: Set<string>): AiMove {
  const selection = state.pending_selection;
  const selectionId = String(selection.id);

  if (selection.zone === 'field_slot') {
    const slots: number[] = (selection.visible_slots ?? []).filter((s: any) => typeof s === 'number');
    const slot = slots.find(s => !failed.has(`SELECT:${selectionId}:slot:${s}`));
    if (slot === undefined) return { kind: 'wait' };
    return { kind: 'selection', key: `SELECT:${selectionId}:slot:${slot}`, selectionId, chosenSlot: slot };
  }

  const ids: string[] = (selection.visible_card_ids ?? []).map(String);
  const options = ids.filter(id => !failed.has(`SELECT:${selectionId}:${id}`));
  if (options.length === 0) return { kind: 'wait' };

  const cardsById = new Map<string, any>((state.cards_in_play ?? []).map((c: any) => [String(c.id), c]));
  const enemies = options.map(id => cardsById.get(id)).filter(c => c && c.player_number !== botPlayer);
  let chosen: string;
  if (enemies.length > 0) {
    // Contra el rival: el caballero más débil (o la carta más cara si no son caballeros)
    enemies.sort((a, b) => num(a.current_health, 99) - num(b.current_health, 99) || num(payloadOf(b).cost) - num(payloadOf(a).cost));
    chosen = String(enemies[0].id);
  } else {
    // Propias o del mazo: la de más valor (coste, luego CE)
    const value = (id: string) => {
      const c = cardsById.get(id);
      return num(payloadOf(c).cost) * 10 + num(c?.current_attack);
    };
    chosen = [...options].sort((a, b) => value(b) - value(a))[0];
  }
  return { kind: 'selection', key: `SELECT:${selectionId}:${chosen}`, selectionId, chosenCardId: chosen };
}

function decidePlayCard(state: any, botPlayer: number, failed: Set<string>): AiMove | null {
  const cards: any[] = state.cards_in_play ?? [];
  const own = cards.filter(c => c.player_number === botPlayer);
  const ownKnights = own.filter(c => c.zone === 'field_knight');
  const knightTags = new Set<string>(ownKnights.flatMap(k => (payloadOf(k).tags ?? []) as string[]));
  const hasOwnScenario = own.some(c => c.zone === 'field_scenario');

  // Ahorro: con poco campo y un caballero en la mano que aún no se puede pagar, no gastar
  // en otras cartas el cosmo que lo bajaría el próximo turno (salvo cartas que generan cosmo)
  const cosmos = num(state[`player${botPlayer}_cosmos`]);
  const handKnights = own.filter(c => c.zone === 'hand' && typeOf(c) === 'knight');
  const canAffordKnight = handKnights.some(c => c.valid_actions?.can_play);
  const pendingKnightCost = Math.min(...handKnights.map(c => num(payloadOf(c).cost, Infinity)));
  const saveForKnight = ownKnights.length < 2 && !canAffordKnight && Number.isFinite(pendingKnightCost);

  const candidates = own
    .filter(c => c.zone === 'hand' && c.valid_actions?.can_play)
    .map(c => ({ card: c, type: typeOf(c), cost: num(payloadOf(c).cost) }))
    .filter(({ card, type, cost }) => {
      if (failed.has(`PLAY:${card.id}`)) return false;
      if (saveForKnight && type !== 'knight' && num(payloadOf(card).generate) <= 0
        && cosmos - cost + 1 < pendingKnightCost) return false;
      if (type === 'stage' && hasOwnScenario) return false; // no tapar el escenario propio
      if (type === 'technique') {
        // Solo técnicas que algún caballero propio en campo pueda usar
        const compatible: string[] = payloadOf(card).card_technique?.compatible_tags ?? [];
        return compatible.some(tag => knightTags.has(tag));
      }
      if (type === 'object') return (card.valid_actions?.equip_targets ?? []).length > 0;
      return (card.valid_actions?.play_slots ?? []).length > 0;
    })
    .sort((a, b) => (PLAY_PRIORITY[b.type] ?? 0) - (PLAY_PRIORITY[a.type] ?? 0) || b.cost - a.cost);

  const pick = candidates[0];
  if (!pick) return null;

  const va = pick.card.valid_actions;
  const action: Record<string, any> = {
    type: 'PLAY_CARD',
    card_id: pick.card.id,
    zone: va.play_zone,
    position: (va.play_slots ?? [0])[0] ?? 0,
  };

  if (pick.type === 'object') {
    // Al caballero propio más fuerte de los que admite el objeto
    const eligible = new Set<string>(va.equip_targets.map(String));
    const best = ownKnights
      .filter(k => eligible.has(String(k.id)))
      .sort((a, b) => (num(b.current_attack) + num(b.current_health)) - (num(a.current_attack) + num(a.current_health)))[0];
    action.equip_target_id = best ? best.id : va.equip_targets[0];
  }

  return { kind: 'action', key: `PLAY:${pick.card.id}`, action };
}

function decideKnightAction(state: any, botPlayer: number, failed: Set<string>): AiMove | null {
  const cards: any[] = state.cards_in_play ?? [];
  const byId = new Map<string, any>(cards.map(c => [String(c.id), c]));
  const cosmos = num(state[`player${botPlayer}_cosmos`]);
  const handBlockedByCost = cards.some(c =>
    c.player_number === botPlayer && c.zone === 'hand' && !c.valid_actions?.can_play && num(payloadOf(c).cost) > cosmos);

  const knights = cards
    .filter(c => c.player_number === botPlayer && c.zone === 'field_knight' && c.valid_actions && !c.valid_actions.has_acted)
    .sort((a, b) => num(b.current_attack) - num(a.current_attack));

  // Habilidades activas sin objetivo: no gastan la acción, se usan antes de actuar
  for (const knight of knights) {
    for (const ability of knight.valid_actions.active_abilities ?? []) {
      if (ability.requires_target) continue;
      const key = `ABILITY:${knight.id}:${ability.ability_name}`;
      if (failed.has(key)) continue;
      return { kind: 'action', key, action: { type: 'USE_ABILITY', card_id: knight.id, ability_name: ability.ability_name } };
    }
  }

  for (const knight of knights) {
    const va = knight.valid_actions;

    // Técnica: la más cara que pueda pagar el caballero
    if (va.can_use_technique && (va.techniques ?? []).length > 0) {
      const techniques = [...va.techniques].sort((a: any, b: any) => num(b.ta_cost) - num(a.ta_cost));
      for (const technique of techniques) {
        const key = `TA:${knight.id}:${technique.technique_id}`;
        if (failed.has(key)) continue;
        const action: Record<string, any> = { type: 'TECHNIQUE_ATTACK', knight_id: knight.id, technique_id: technique.technique_id };
        if (!technique.target_all) {
          const targets = (va.technique_targets ?? []).map((id: string) => byId.get(String(id))).filter(Boolean);
          const techCard = byId.get(String(technique.technique_id));
          const stats = payloadOf(techCard).card_technique ?? {};
          const perHit = Math.max(1, num(stats.hit_ce) || num(knight.current_attack));
          const target = chooseTarget(knight, targets, t => Math.max(1, perHit - num(t.current_defense)) * Math.max(1, num(stats.hit_count, 1)));
          if (target) action.defender_id = target.id;
          else if (targets.length > 0) continue;
          // Sin objetivos: técnica directa al jugador rival (defender_id vacío)
        }
        return { kind: 'action', key, action };
      }
    }

    // Ataque básico
    if (va.can_attack && Array.isArray(va.attack_targets)) {
      const key = `BA:${knight.id}`;
      if (!failed.has(key)) {
        if (va.attack_targets.length === 0) {
          return { kind: 'action', key, action: { type: 'ATTACK', attacker_id: knight.id } };
        }
        const targets = va.attack_targets.map((id: string) => byId.get(String(id))).filter(Boolean);
        const target = chooseTarget(knight, targets, t => estimateBasicDamage(knight, t));
        if (target) {
          const damage = estimateBasicDamage(knight, target);
          const weakHit = damage <= 1 && damage < num(target.current_health, 1);
          // Un golpe de 1 que no remata vale menos que cargar cosmo si la mano espera cosmo
          const preferCharge = weakHit && va.can_charge && handBlockedByCost && cosmos < LOW_COSMOS
            && !failed.has(`CHARGE:${knight.id}`);
          if (!preferCharge) {
            return { kind: 'action', key, action: { type: 'ATTACK', attacker_id: knight.id, defender_id: target.id } };
          }
        }
      }
    }

    // Cargar Cosmo cuando hace falta cosmo
    if (va.can_charge && cosmos < LOW_COSMOS + 2) {
      const key = `CHARGE:${knight.id}`;
      if (!failed.has(key)) {
        return { kind: 'action', key, action: { type: 'CHARGE_COSMOS', knight_id: knight.id } };
      }
    }

    // Protegerse si está tocado
    const maxHealth = Math.max(1, num(knight.max_health, num(knight.current_health, 1)));
    if (va.can_defend && num(knight.current_health) / maxHealth < 0.5) {
      const key = `DEF:${knight.id}`;
      if (!failed.has(key)) {
        return { kind: 'action', key, action: { type: 'CHANGE_DEFENSIVE_MODE', card_id: knight.id, mode: 'defense' } };
      }
    }
  }

  return null;
}

/**
 * Siguiente jugada de la IA (jugador `botPlayer`) para el estado dado.
 * `state` es el estado completo de la partida con valid_actions ya calculadas (ActionResolver).
 * Devuelve 'wait' cuando no le toca (turno rival, selección pendiente del rival o partida terminada).
 */
export function decideAiMove(state: any, botPlayer: 1 | 2, failed: Set<string> = new Set()): AiMove {
  if (!state || state.phase === 'finished' || state.winner_id) return { kind: 'wait' };

  if (state.pending_selection) {
    return state.pending_selection.player_number === botPlayer
      ? decideSelection(state, botPlayer, failed)
      : { kind: 'wait' };
  }

  if (Number(state.current_player) !== botPlayer) return { kind: 'wait' };

  return decidePlayCard(state, botPlayer, failed)
    ?? decideKnightAction(state, botPlayer, failed)
    ?? { kind: 'action', key: END_TURN_KEY, action: { type: 'END_TURN' } };
}
