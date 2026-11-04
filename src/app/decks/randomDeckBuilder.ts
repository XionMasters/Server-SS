// src/app/decks/randomDeckBuilder.ts
// Construye un mazo aleatorio pero jugable a partir del catálogo de cartas (sin BD).
//
// Criterio:
//   - Facción al azar entre las que tienen caballeros suficientes (las neutrales siempre suman).
//   - ~22 caballeros de esa facción.
//   - Técnicas que esos caballeros pueden usar (compatible_tags ∩ tags del caballero).
//   - 1–2 escenarios y el resto objetos, ayudantes y ocasiones hasta el objetivo.
//   - Respeta max_copies, limita legendarias/divinas y pone 1 copia de las cartas únicas.
//   - Si la facción se queda corta, completa con caballeros de otras facciones.

import { normalizeCardType } from '../../domain/game/CardTypes';
import { DEFAULT_DECK_CONSTRUCTION_RULES, getCardDeckCopyLimit } from '../../config/deck-rules.config';

export interface CatalogCard {
  id: string;
  code: string;
  name: string;
  type: string;
  faction: string | null;
  rarity: string;
  max_copies: number | null;
  unique: boolean;
  tags: string[] | null;
  /** Solo técnicas: etiquetas de los caballeros que pueden usarla */
  compatible_tags?: string[] | null;
}

export interface RandomDeckOptions {
  targetCards?: number;
  knights?: number;
  maxTechniques?: number;
  maxLegendaries?: number;
  /** Fuerza una facción concreta (si no, se elige al azar) */
  faction?: string;
  /** Generador aleatorio en [0, 1); por defecto Math.random */
  rng?: () => number;
}

export interface RandomDeck {
  faction: string;
  cards: Array<{ card_id: string; quantity: number }>;
  total: number;
  by_type: Record<string, number>;
}

const NEUTRAL_FACTION = 'neutral';
const MIN_KNIGHTS_FOR_FACTION = 15;
const HIGH_RARITIES = new Set(['legendary', 'divine']);

export function buildRandomDeck(catalog: CatalogCard[], options: RandomDeckOptions = {}): RandomDeck {
  const rng = options.rng ?? Math.random;
  const target = Math.min(
    Math.max(options.targetCards ?? 42, DEFAULT_DECK_CONSTRUCTION_RULES.minCards),
    DEFAULT_DECK_CONSTRUCTION_RULES.maxCards,
  );
  const knightTarget = options.knights ?? 22;
  const maxTechniques = options.maxTechniques ?? 8;
  const maxLegendaries = options.maxLegendaries ?? 4;

  const cards = catalog.map(c => ({ ...c, type: normalizeCardType(c.type), tags: c.tags ?? [] }));
  const factionOf = (c: CatalogCard) => (c.faction ?? '').trim();
  const isNeutral = (c: CatalogCard) => factionOf(c).toLowerCase() === NEUTRAL_FACTION || factionOf(c) === '';

  // ── Facción ────────────────────────────────────────────────────────────────
  const knightsByFaction = new Map<string, number>();
  for (const c of cards) {
    if (c.type === 'knight' && !isNeutral(c)) {
      knightsByFaction.set(factionOf(c), (knightsByFaction.get(factionOf(c)) ?? 0) + 1);
    }
  }
  const eligible = [...knightsByFaction.entries()]
    .filter(([, n]) => n >= MIN_KNIGHTS_FOR_FACTION)
    .map(([f]) => f)
    .sort();
  if (eligible.length === 0) throw new Error('No hay ninguna facción con caballeros suficientes para un mazo');
  const faction = options.faction && eligible.includes(options.faction)
    ? options.faction
    : eligible[Math.floor(rng() * eligible.length)];

  const inFaction = (c: CatalogCard) => factionOf(c) === faction || isNeutral(c);
  const shuffle = <T>(list: T[]): T[] => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const selected = new Map<string, number>();
  const byId = new Map(cards.map(c => [c.id, c]));
  let total = 0;
  let legendaries = 0;

  /** Copias que se quieren de una carta según su rareza (antes de los límites) */
  const desiredCopies = (c: CatalogCard): number => {
    if (c.unique || HIGH_RARITIES.has(c.rarity) || c.rarity === 'epic') return 1;
    if (c.rarity === 'rare') return 2;
    return 2 + Math.floor(rng() * 2); // común: 2–3
  };

  /**
   * Lleva una carta hasta `wanted` copias en total (si ya estaba, suma las que falten),
   * respetando max_copies, el hueco disponible y el límite de legendarias.
   * Devuelve cuántas copias añadió.
   */
  const add = (c: CatalogCard, wanted: number, room: number): number => {
    const current = selected.get(c.id) ?? 0;
    if (room <= 0) return 0;
    if (current === 0 && HIGH_RARITIES.has(c.rarity) && legendaries >= maxLegendaries) return 0;
    const maxTotal = c.unique ? 1 : getCardDeckCopyLimit(c.max_copies);
    const copies = Math.min(wanted - current, maxTotal - current, room, target - total);
    if (copies <= 0) return 0;
    selected.set(c.id, current + copies);
    total += copies;
    if (current === 0 && HIGH_RARITIES.has(c.rarity)) legendaries++;
    return copies;
  };

  const fill = (pool: CatalogCard[], goal: number, copies: (c: CatalogCard) => number): number => {
    let added = 0;
    for (const c of shuffle(pool)) {
      if (added >= goal || total >= target) break;
      added += add(c, copies(c), goal - added);
    }
    return added;
  };

  // ── Caballeros ─────────────────────────────────────────────────────────────
  const factionKnights = cards.filter(c => c.type === 'knight' && inFaction(c));
  let knights = fill(factionKnights, knightTarget, desiredCopies);
  if (knights < knightTarget) {
    // Facción corta: segunda pasada con más copias de los no únicos
    knights += fill(factionKnights.filter(c => !c.unique), knightTarget - knights, () => 3);
  }

  // ── Técnicas usables por los caballeros elegidos ───────────────────────────
  const knightTags = new Set<string>();
  for (const id of selected.keys()) {
    const c = byId.get(id)!;
    if (c.type === 'knight') c.tags!.forEach(t => knightTags.add(t));
  }
  const usableTechniques = cards.filter(c =>
    c.type === 'technique' && (c.compatible_tags ?? []).some(t => knightTags.has(t)));
  fill(usableTechniques, maxTechniques, c => (c.rarity === 'common' ? 2 : 1));

  // ── Escenarios (1–2) y resto de soporte ────────────────────────────────────
  const stages = cards.filter(c => c.type === 'stage' && inFaction(c));
  fill(stages, 1 + Math.floor(rng() * 2), () => 1);

  const support = cards.filter(c => ['object', 'helper', 'occasion'].includes(c.type) && inFaction(c));
  fill(support, target - total, c => (c.unique || HIGH_RARITIES.has(c.rarity) ? 1 : 2));

  // ── Relleno: si aún falta, caballeros no únicos de cualquier facción ───────
  if (total < target) {
    fill(cards.filter(c => c.type === 'knight' && !c.unique), target - total, () => 2);
  }

  if (total < DEFAULT_DECK_CONSTRUCTION_RULES.minCards) {
    throw new Error(`No se pudo completar un mazo de ${DEFAULT_DECK_CONSTRUCTION_RULES.minCards} cartas (solo ${total})`);
  }

  const by_type: Record<string, number> = {};
  for (const [id, qty] of selected) {
    const type = byId.get(id)!.type;
    by_type[type] = (by_type[type] ?? 0) + qty;
  }

  return {
    faction,
    cards: [...selected.entries()].map(([card_id, quantity]) => ({ card_id, quantity })),
    total,
    by_type,
  };
}
