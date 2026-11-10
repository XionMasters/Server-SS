/**
 * IA (Jugador vs IA): decideAiMove elige solo entre lo que ActionResolver ofrece.
 * Los estados se arman como los serializa el servidor y pasan por ActionResolver.resolve,
 * igual que en aiTurnRunner.
 */
import { ActionResolver } from '../../src/app/matches/actions/ActionResolver';
import { decideAiMove, estimateBasicDamage, END_TURN_KEY } from '../../src/app/matches/ai/aiDecision';
import { isAiBot, AI_BOT_USER_ID } from '../../src/app/matches/ai/aiBot';

const BOT = 2 as const;

function fieldKnight(id: string, player: 1 | 2, position: number, stats: Partial<Record<string, any>> = {}) {
  return {
    id, player_number: player, zone: 'field_knight', position,
    current_attack: 3, current_defense: 1, current_health: 5, max_health: 5, current_cosmos: 0,
    has_attacked_this_turn: false, can_attack_this_turn: true, status_effects: [], mode: 'normal',
    base_data: { type: 'knight', cost: 2, tags: ['bronze'], card_knight: { can_defend: true } },
    ...stats,
  };
}

function handCard(id: string, player: 1 | 2, type: string, cost: number, extra: Record<string, any> = {}) {
  return { id, player_number: player, zone: 'hand', position: 0, base_data: { type, cost, tags: [], ...extra } };
}

function match(cards: any[], params: Record<string, any> = {}) {
  const state: any = {
    phase: 'player2_turn', current_turn: 3, current_player: BOT, first_player: 1,
    player1_cosmos: 5, player2_cosmos: 5, player1_life: 10, player2_life: 10,
    pending_selection: null,
    ...params,
  };
  state.cards_in_play = ActionResolver.resolve(cards, state);
  return state;
}

describe('IA: identidad', () => {
  test('reconoce al usuario de la IA', () => {
    expect(isAiBot(AI_BOT_USER_ID)).toBe(true);
    expect(isAiBot('otro')).toBe(false);
    expect(isAiBot(null)).toBe(false);
  });
});

describe('IA: decideAiMove', () => {
  test('espera si no es su turno o la partida terminó', () => {
    expect(decideAiMove(match([], { current_player: 1, phase: 'player1_turn' }), BOT).kind).toBe('wait');
    expect(decideAiMove(match([], { phase: 'finished' }), BOT).kind).toBe('wait');
  });

  test('juega el caballero que puede pagar en una casilla libre', () => {
    const s = match([
      fieldKnight('mine', BOT, 0),
      handCard('caro', BOT, 'knight', 9),
      handCard('barato', BOT, 'knight', 3),
    ]);
    const move = decideAiMove(s, BOT);
    expect(move).toMatchObject({ kind: 'action', action: { type: 'PLAY_CARD', card_id: 'barato', zone: 'field_knight' } });
    expect((move as any).action.position).toBe(1); // la 0 está ocupada
  });

  test('sin campo, ahorra para el caballero de la mano en vez de gastar en otras cartas', () => {
    const s = match([
      handCard('caballero', BOT, 'knight', 3),
      handCard('ocasion', BOT, 'occasion', 2),
      handCard('ayudante', BOT, 'helper', 1),
    ], { player2_cosmos: 2 });
    // Con 2 de cosmo: jugar el ayudante (1) deja 1+1 = 2 el próximo turno, no llega a 3 → tampoco
    expect(decideAiMove(s, BOT)).toMatchObject({ key: END_TURN_KEY });

    // Con un caballero que sí puede pagar, juega normal
    const s2 = match([handCard('barato', BOT, 'knight', 1), handCard('ocasion', BOT, 'occasion', 1)], { player2_cosmos: 2 });
    expect(decideAiMove(s2, BOT)).toMatchObject({ action: { type: 'PLAY_CARD', card_id: 'barato' } });
  });

  test('no juega técnicas que ningún caballero propio puede usar', () => {
    const s = match([
      fieldKnight('mine', BOT, 0),
      handCard('tec', BOT, 'technique', 1, { card_technique: { compatible_tags: ['gold'], ta_cost: 1 } }),
    ], { current_turn: 1, first_player: BOT });
    const move = decideAiMove(s, BOT);
    expect((move as any).action?.card_id).not.toBe('tec');
  });

  test('ataca rematando al caballero que puede matar', () => {
    const s = match([
      fieldKnight('mine', BOT, 0, { current_attack: 5 }),
      fieldKnight('fuerte', 1, 0, { current_health: 20, current_defense: 0 }),
      fieldKnight('tocado', 1, 1, { current_health: 3, current_defense: 1 }),
    ]);
    expect(decideAiMove(s, BOT)).toMatchObject({
      kind: 'action', action: { type: 'ATTACK', attacker_id: 'mine', defender_id: 'tocado' },
    });
  });

  test('ataque directo si el rival no tiene caballeros', () => {
    const s = match([fieldKnight('mine', BOT, 0)]);
    const move = decideAiMove(s, BOT);
    expect(move).toMatchObject({ kind: 'action', action: { type: 'ATTACK', attacker_id: 'mine' } });
    expect((move as any).action.defender_id).toBeUndefined();
  });

  test('en su primer turno (sin ataque directo) carga cosmo con el caballero', () => {
    const s = match([fieldKnight('mine', BOT, 0)], { current_turn: 1, first_player: BOT, player2_cosmos: 2 });
    expect(decideAiMove(s, BOT)).toMatchObject({
      kind: 'action', action: { type: 'CHARGE_COSMOS', knight_id: 'mine' },
    });
  });

  test('prefiere la técnica al ataque básico', () => {
    const s = match([
      fieldKnight('mine', BOT, 0, { current_cosmos: 4 }),
      { id: 'tec', player_number: BOT, zone: 'field_technique', position: 0,
        base_data: { type: 'technique', name: 'Meteoros', card_technique: { compatible_tags: ['bronze'], ta_cost: 2, hit_count: 3, hit_ce: 2 } } },
      fieldKnight('rival', 1, 0),
    ]);
    expect(decideAiMove(s, BOT)).toMatchObject({
      kind: 'action', action: { type: 'TECHNIQUE_ATTACK', knight_id: 'mine', technique_id: 'tec', defender_id: 'rival' },
    });
  });

  test('no repite una jugada fallida y termina el turno cuando no queda nada', () => {
    const s = match([fieldKnight('mine', BOT, 0, { has_attacked_this_turn: true })]);
    expect(decideAiMove(s, BOT)).toMatchObject({ kind: 'action', key: END_TURN_KEY });

    const withCard = match([handCard('k', BOT, 'knight', 1)]);
    const first = decideAiMove(withCard, BOT);
    expect(first).toMatchObject({ action: { type: 'PLAY_CARD', card_id: 'k' } });
    expect(decideAiMove(withCard, BOT, new Set([(first as any).key]))).toMatchObject({ key: END_TURN_KEY });
  });

  test('resuelve su selección pendiente eligiendo al rival más débil', () => {
    const s = match([
      fieldKnight('r1', 1, 0, { current_health: 8 }),
      fieldKnight('r2', 1, 1, { current_health: 2 }),
    ], {
      current_player: 1, phase: 'player1_turn',
      pending_selection: { id: 'sel', player_number: BOT, zone: 'field_knight', visible_card_ids: ['r1', 'r2'] },
    });
    expect(decideAiMove(s, BOT)).toMatchObject({ kind: 'selection', selectionId: 'sel', chosenCardId: 'r2' });
  });

  test('selección de posición: responde con una casilla visible', () => {
    const s = match([], {
      pending_selection: { id: 'pos', player_number: BOT, zone: 'field_slot', visible_slots: [3, 4] },
    });
    expect(decideAiMove(s, BOT)).toMatchObject({ kind: 'selection', chosenSlot: 3 });
  });

  test('espera mientras la selección pendiente es del rival', () => {
    const s = match([], { pending_selection: { id: 'x', player_number: 1, zone: 'hand', visible_card_ids: ['a'] } });
    expect(decideAiMove(s, BOT).kind).toBe('wait');
  });

  test('daño estimado de BA: max(1, CE − AR), a la mitad en defensa', () => {
    expect(estimateBasicDamage({ current_attack: 5 }, { current_defense: 2 })).toBe(3);
    expect(estimateBasicDamage({ current_attack: 1 }, { current_defense: 4 })).toBe(1);
    expect(estimateBasicDamage({ current_attack: 9 }, { current_defense: 1, mode: 'defense' })).toBe(4);
  });
});
