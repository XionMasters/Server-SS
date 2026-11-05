/**
 * CardFilter.ts
 *
 * Filtro declarativo común a targets, selecciones y equipamiento.
 * Estructura: { type?, code?, tag?: string | string[], health_max?, status? }
 * Si la carta tiene varios tags, basta con que coincida uno.
 *
 * Vive aparte de ActionRegistry para que reglas como la de equipamiento lo usen
 * sin crear dependencias circulares (ActionRegistry → KillAction → equipment.rules).
 */
import { normalizeCardType } from '../CardTypes';

export function matchesCardFilter(card: any, filter: any): boolean {
  if (!filter) return true;
  if (filter.type) {
    const wanted = (Array.isArray(filter.type) ? filter.type : [filter.type]).map(normalizeCardType);
    if (!wanted.includes(card.card_type)) return false;
  }
  if (filter.code && card.card_code !== filter.code) return false;
  if (filter.tag) {
    const tags: string[] = Array.isArray(filter.tag) ? filter.tag : [filter.tag];
    if (!Array.isArray(card.tags) || !tags.some(t => card.tags.includes(t))) return false;
  }
  if (typeof filter.health_max === 'number' && (card.current_health ?? 0) > filter.health_max) return false;
  if (filter.status && !(card.status_effects ?? []).some((e: any) => e.type === filter.status)) return false;
  return true;
}
