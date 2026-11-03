/**
 * Reglas de servidor que protegen la partida aunque el cliente envíe acciones inválidas:
 *   - cada habilidad activa se usa una vez por turno y caballero (marker ability_used)
 *   - cada tipo de carta solo se juega en su zona (PLAY_ZONE_BY_TYPE)
 *   - las selecciones pendientes llevan sus opciones (el cliente no calcula reglas)
 */
import { createEmptyGameState, type CardInGameState } from '../../src/domain/game/GameState';
import { KnightRulesEngine } from '../../src/domain/game/KnightRulesEngine';
import { CardRulesEngine } from '../../src/domain/game/CardRulesEngine';
import { tickStatusEffects } from '../../src/domain/game/StatusEffects';
import { parseAbilityDef } from '../../src/domain/game/abilities/AbilityDefinition';
import { AbilityEngine } from '../../src/domain/game/abilities/AbilityEngine';

function knight(id: string, params: Partial<CardInGameState> = {}): CardInGameState {
  return {
    instance_id: id,
    card_id: `card-${id}`,
    card_type: 'knight',
    player_number: 1,
    zone: 'field_knight',
    position: 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: [],
    card_code: `code-${id}`,
    tags: [],
    raw_abilities: [],
    ce: 3,
    ar: 1,
    current_health: 5,
    max_health: 5,
    current_cosmos: 4,
    base_ce: 3,
    base_ar: 1,
    ...params,
  };
}

describe('Habilidad activa: una vez por turno', () => {
  const ability = parseAbilityDef({
    trigger: 'ACTIVE',
    actions: [{ type: 'apply_status', status: 'ta_causes_par', target: 'self' }],
  })!;
  const event: any = { type: 'ACTIVE', playerNumber: 1, sourceCardId: 'k' };

  function stateWithKnight() {
    const state = createEmptyGameState('once-per-turn');
    state.current_player = 1;
    state.phase = 'player1_turn';
    state.player1.field_knights.push(knight('k'));
    return state;
  }

  test('tras usarla, no se puede repetir en el mismo turno', () => {
    const state = stateWithKnight();
    expect(KnightRulesEngine.validateUseAbility(state, 1, 'k', ability, event, 'dark_effect').valid).toBe(true);

    const { newState } = KnightRulesEngine.useAbility(state, 1, 'k', ability, event, 'dark_effect');
    expect(KnightRulesEngine.validateUseAbility(newState, 1, 'k', ability, event, 'dark_effect').valid).toBe(false);
    // Otra habilidad del mismo caballero sigue disponible
    expect(KnightRulesEngine.validateUseAbility(newState, 1, 'k', ability, event, 'otra').valid).toBe(true);
  });

  test('vuelve a estar disponible en el siguiente turno propio', () => {
    const { newState } = KnightRulesEngine.useAbility(stateWithKnight(), 1, 'k', ability, event, 'dark_effect');
    const k = newState.player1.field_knights[0];
    k.status_effects = tickStatusEffects(k.status_effects);
    expect(KnightRulesEngine.validateUseAbility(newState, 1, 'k', ability, event, 'dark_effect').valid).toBe(true);
  });
});

describe('Las selecciones siempre traen sus opciones (visible_card_ids)', () => {
  const event: any = { type: 'ACTIVE', playerNumber: 1, sourceCardId: 'k' };
  function stateWithHand() {
    const state = createEmptyGameState('selection-options');
    state.current_player = 1;
    state.phase = 'player1_turn';
    state.player1.field_knights.push(knight('k'));
    state.player1.hand.push(knight('h1', { zone: 'hand' }), knight('h2', { zone: 'hand', card_type: 'technique' }));
    return state;
  }

  test('coste de descarte sin filtro: las opciones son toda la mano', () => {
    const def = parseAbilityDef({
      trigger: 'ACTIVE',
      cost: [{ type: 'discard', amount: 1 }],
      actions: [{ type: 'apply_status', status: 'ignore_armor', target: 'self' }],
    })!;
    const { newState } = AbilityEngine.execute(def, stateWithHand(), 1, 'k', event);
    expect(newState.pending_selection?.zone).toBe('hand');
    expect(newState.pending_selection?.visible_card_ids?.sort()).toEqual(['h1', 'h2']);
  });

  test('request_selection en la mano filtra y lista las cartas', () => {
    const def = parseAbilityDef({
      trigger: 'ACTIVE',
      actions: [{ type: 'request_selection', zone: 'hand', filter: { type: 'technique' }, destination: 'cositos', on_select: [] }],
    })!;
    const { newState } = AbilityEngine.execute(def, stateWithHand(), 1, 'k', event);
    expect(newState.pending_selection?.visible_card_ids).toEqual(['h2']);
  });
});

describe('Zona de juego según el tipo de carta', () => {
  const state = createEmptyGameState('play-zone');
  state.player1.cosmos = 10;
  state.player1.hand.push(knight('h', { zone: 'hand' }));
  const play = (zone: string, type: string) =>
    CardRulesEngine.validatePlayCard(state, 1, 'h', zone, 0, 0, 0, false, type).valid;

  test('cada tipo va a su zona', () => {
    expect(play('field_knight', 'knight')).toBe(true);
    expect(play('field_support', 'technique')).toBe(true);
    expect(play('field_support', 'object')).toBe(true);
    expect(play('field_helper', 'helper')).toBe(true);
    expect(play('field_occasion', 'occasion')).toBe(true);
    expect(play('field_scenario', 'stage')).toBe(true);
  });

  test('una carta no puede jugarse en la zona de otro tipo', () => {
    expect(play('field_helper', 'knight')).toBe(false);
    expect(play('field_knight', 'technique')).toBe(false);
    expect(play('field_occasion', 'stage')).toBe(false);
  });
});
