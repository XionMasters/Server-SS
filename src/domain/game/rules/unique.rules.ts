/**
 * Regla de cartas únicas.
 *
 * Un jugador no puede tener en su campo dos caballeros del mismo personaje si alguno
 * de ellos es único: Kanon v1 y Kanon v2 comparten `character` ('kanon'). Cada jugador
 * puede tener su propio Kanon. Cuántas copias van en el mazo lo decide `max_copies`.
 *
 * Sin `character`, la identidad es el card_code (dos copias de la misma carta).
 */

import type { CardInGameState } from '../GameState';

export type UniqueRuleCard = Pick<CardInGameState, 'instance_id' | 'card_code' | 'character' | 'unique'>;

export function characterKey(card: Pick<CardInGameState, 'card_code' | 'character'>): string {
  return card.character || card.card_code;
}

/** Caballero del campo que impide que `card` entre, o undefined si puede entrar. */
export function findUniqueConflict<T extends UniqueRuleCard>(fieldKnights: T[], card: UniqueRuleCard): T | undefined {
  const key = characterKey(card);
  if (!key) return undefined;
  return fieldKnights.find(k =>
    k.instance_id !== card.instance_id
    && characterKey(k) === key
    && (card.unique === true || k.unique === true));
}
