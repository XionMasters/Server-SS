/**
 * Registro de cachés en memoria indexadas por card_id.
 *
 * Los managers de partida cachean definiciones de carta (stats, habilidades)
 * para evitar N+1 queries. Cualquier escritura administrativa sobre una carta
 * debe llamar a invalidateCardDefinition para que las partidas no usen datos
 * obsoletos. Solo invalida este proceso.
 */

const registeredCaches = new Set<Map<string, unknown>>();

export function createCardDefinitionCache<T>(): Map<string, T> {
  const cache = new Map<string, T>();
  registeredCaches.add(cache as Map<string, unknown>);
  return cache;
}

export function invalidateCardDefinition(cardId: string): void {
  for (const cache of registeredCaches) {
    cache.delete(cardId);
  }
}

export function clearCardDefinitionCaches(): void {
  for (const cache of registeredCaches) {
    cache.clear();
  }
}
