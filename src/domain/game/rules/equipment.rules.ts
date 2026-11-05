/**
 * Equipamiento: los objetos se equipan a un caballero propio.
 *
 *  - Al jugar un objeto, el jugador elige a cuál de sus caballeros se lo equipa.
 *    Solo valen los caballeros que cumplen el filtro de la selección de campo propio
 *    de la habilidad del objeto (ej: Armadura de Sagitario → caballero [bronze]).
 *  - Esa selección se resuelve sola con el caballero equipado (ActionRegistry.request_selection),
 *    así que el efecto se aplica a él sin volver a preguntar.
 *  - El objeto ocupa una posición de la fila de técnicas/objetos (la del caballero si está libre)
 *    y el caballero guarda su id en `attached_cards`.
 *  - Cuando el caballero sale del campo (muere, se sacrifica, vuelve a la mano…),
 *    sus objetos van al yomotsu (`releaseEquipment`, llamado desde KillAction y send_to_zone).
 */
import type { CardInGameState, GameState, Player } from '../GameState';
import type { RawAbility } from '../abilities/AbilityDefinition';
import { GameEventType } from '../events/GameEvents';
import { matchesCardFilter } from '../targets/CardFilter';

export const MAX_SUPPORT_SLOTS = 5;

/** Busca (en profundidad) la primera selección de caballero propio de una lista de acciones. */
function findOwnFieldSelection(actions: any[] | undefined): any | null {
  for (const action of actions ?? []) {
    if (action?.type === 'request_selection' && action.zone === 'field') return action;
    const nested = [action?.on_select, action?.heads, action?.on_heads, action?.tails, action?.on_fail];
    for (const list of nested) {
      if (Array.isArray(list)) {
        const found = findOwnFieldSelection(list);
        if (found) return found;
      }
    }
  }
  return null;
}

/**
 * Filtro de los caballeros a los que se puede equipar el objeto.
 * Si su efecto de entrada elige un caballero propio, se usa el filtro de esa selección;
 * si no, cualquier caballero propio.
 */
export function getEquipFilter(rawAbilities: RawAbility[] | any[] | undefined): Record<string, any> {
  for (const raw of rawAbilities ?? []) {
    const def = (raw as any)?.effects;
    if (!def || def.trigger !== GameEventType.CARD_PLAYED) continue;
    const selection = findOwnFieldSelection(def.actions);
    if (selection) return { ...(selection.filter ?? {}), type: 'knight' };
  }
  return { type: 'knight' };
}

/** Caballeros propios a los que se puede equipar un objeto con esas habilidades. */
export function equipEligibleKnights<T extends { card_type: string }>(
  rawAbilities: RawAbility[] | any[] | undefined,
  ownKnights: T[],
): T[] {
  const filter = getEquipFilter(rawAbilities);
  return ownKnights.filter(k => matchesCardFilter(k, filter));
}

/**
 * Posición de la fila de técnicas/objetos donde se coloca el objeto:
 * la misma que la del caballero si está libre, si no la primera libre; -1 si la fila está llena.
 */
export function pickEquipSlot(knightPosition: number, occupiedSupport: Iterable<number>): number {
  const occupied = new Set(occupiedSupport);
  if (!occupied.has(knightPosition)) return knightPosition;
  for (let i = 0; i < MAX_SUPPORT_SLOTS; i++) {
    if (!occupied.has(i)) return i;
  }
  return -1;
}

/** Equipa (en el estado) el objeto al caballero. */
export function attachEquipment(knight: CardInGameState, objectInstanceId: string): void {
  const current = Array.isArray(knight.attached_cards) ? knight.attached_cards : [];
  if (!current.includes(objectInstanceId)) knight.attached_cards = [...current, objectInstanceId];
}

/**
 * El caballero salió del campo: sus objetos equipados van al yomotsu de su dueño.
 * Devuelve los objetos movidos.
 */
export function releaseEquipment(state: GameState, knight: CardInGameState): CardInGameState[] {
  const attached = Array.isArray(knight.attached_cards) ? knight.attached_cards : [];
  knight.attached_cards = [];
  if (attached.length === 0) return [];

  const owner: Player = knight.player_number === 1 ? state.player1 : state.player2;
  const released: CardInGameState[] = [];
  for (const objectId of attached) {
    const idx = owner.field_techniques.findIndex(c => c.instance_id === objectId);
    if (idx === -1) continue;
    const [object] = owner.field_techniques.splice(idx, 1);
    object.zone = 'yomotsu';
    if (!Array.isArray(owner.graveyard)) owner.graveyard = [];
    owner.graveyard.push(object);
    released.push(object);
  }
  owner.graveyard_count = owner.graveyard.length;
  return released;
}
