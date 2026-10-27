// Vista de partidas para el panel admin. Funciones puras sobre registros planos.

export type MatchRecord = Record<string, any>;

export interface AdminMatchRepository {
  findActiveMatches(limit: number): Promise<MatchRecord[]>;
  findMatchForInspection(matchId: string): Promise<MatchRecord | null>;
}

/** Calcula valid_actions para las cartas en juego desde la perspectiva de un jugador activo. */
export type ResolveValidActions = (cards: any[], matchState: Record<string, unknown>) => any[];

const ZONES = ['hand', 'field_knight', 'field_support', 'field_helper', 'yomotsu', 'cositos', 'deck'];

const createdAtOf = (match: MatchRecord) => match.createdAt ?? match.created_at ?? null;

const parseStatusEffects = (raw: unknown) => {
  try {
    return JSON.parse((raw as string) || '[]');
  } catch {
    return [];
  }
};

export function toActiveMatchSummary(match: MatchRecord) {
  return {
    id: match.id,
    phase: match.phase,
    current_turn: match.current_turn,
    current_player: match.current_player,
    player1: { id: match.player1_id, username: match.player1?.username || '?' },
    player2: { id: match.player2_id, username: match.player2?.username || '(vacío)' },
    player1_life: match.player1_life,
    player2_life: match.player2_life,
    player1_cosmos: match.player1_cosmos,
    player2_cosmos: match.player2_cosmos,
    created_at: createdAtOf(match),
  };
}

function remainingDeck(match: MatchRecord, cards: any[], playerNumber: 1 | 2): number {
  const deckOrder = match[`player${playerNumber}_deck_order`];
  if (deckOrder) {
    return Math.max(0, JSON.parse(deckOrder).length - (match[`player${playerNumber}_deck_index`] ?? 0));
  }
  return cards.filter((c) => c.player_number === playerNumber && c.zone === 'deck').length;
}

export function buildMatchInspection(match: MatchRecord, resolveValidActions: ResolveValidActions) {
  const cards: any[] = match.cards_in_play ?? [];

  // Admin: valid_actions para AMBOS jugadores, para tener visibilidad completa del campo
  const rawCards = cards.map((c) => ({
    id: c.id,
    player_number: c.player_number,
    zone: c.zone,
    position: c.position,
    is_defensive_mode: c.is_defensive_mode,
    can_attack_this_turn: c.can_attack_this_turn,
    has_attacked_this_turn: c.has_attacked_this_turn,
    card: c.card ? { type: c.card.type, cost: c.card.cost, card_knight: c.card.card_knight } : undefined,
  }));
  const matchMeta = {
    player1_life: match.player1_life,
    player2_life: match.player2_life,
    player1_cosmos: match.player1_cosmos,
    player2_cosmos: match.player2_cosmos,
  };
  const validActionsMap = new Map<string, any>();
  for (const currentPlayer of [1, 2]) {
    resolveValidActions(rawCards, { ...matchMeta, current_player: currentPlayer }).forEach((c: any) => {
      if (c.valid_actions !== null) validActionsMap.set(c.id, c.valid_actions);
    });
  }

  const buildZones = (playerNumber: number) => {
    const result: Record<string, any[]> = {};
    for (const zone of ZONES) {
      result[zone] = cards
        .filter((c) => c.player_number === playerNumber && c.zone === zone)
        .sort((a, b) => a.position - b.position)
        .map((c) => ({
          instance_id: c.id,
          card_id: c.card_id,
          position: c.position,
          mode: c.is_defensive_mode,
          is_exhausted: c.has_attacked_this_turn || !c.can_attack_this_turn,
          can_attack: c.can_attack_this_turn,
          has_attacked: c.has_attacked_this_turn,
          status_effects: parseStatusEffects(c.status_effects),
          valid_actions: validActionsMap.get(c.id) ?? null,
          atk: c.current_attack,
          def: c.current_defense,
          hp: c.current_health,
          cosmos: c.current_cosmos,
          name: c.card?.name || '?',
          type: c.card?.type || '?',
          rarity: c.card?.rarity || '?',
          cost: c.card?.cost ?? '?',
          element: c.card?.element || '',
          image_url: c.card?.image_url || '',
          knight: c.card?.card_knight
            ? {
                ce: c.card.card_knight.cosmos,
                ar: c.card.card_knight.defense,
                hp: c.card.card_knight.health,
                atk: c.card.card_knight.attack,
              }
            : null,
        }));
    }
    return result;
  };

  const player = (playerNumber: 1 | 2) => ({
    id: match[`player${playerNumber}_id`],
    username: match[`player${playerNumber}`]?.username || '?',
    life: match[`player${playerNumber}_life`],
    cosmos: match[`player${playerNumber}_cosmos`],
    deck_remaining: remainingDeck(match, cards, playerNumber),
    deck_index: match[`player${playerNumber}_deck_index`] ?? 0,
  });

  return {
    id: match.id,
    phase: match.phase,
    current_turn: match.current_turn,
    current_player: match.current_player,
    created_at: createdAtOf(match),
    player1: player(1),
    player2: player(2),
    zones: {
      player1: buildZones(1),
      player2: buildZones(2),
    },
  };
}
