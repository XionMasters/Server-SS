import { Op } from 'sequelize';
import { createEmptyGameState, type CardInGameState, type GameScenario } from '../../src/domain/game/GameState';
import { CardRulesEngine } from '../../src/domain/game/CardRulesEngine';
import { MatchRepository } from '../../src/infrastructure/database/repositories/MatchRepository';
import CardInPlay from '../../src/infrastructure/database/models/CardInPlay';
import { MatchStateMapper } from '../../src/app/matches/mappers/MatchStateMapper';

jest.mock('../../src/infrastructure/database/models/CardInPlay', () => ({
  __esModule: true,
  default: {
    update: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/Match', () => ({
  __esModule: true,
  default: class Match {},
}));

jest.mock('../../src/app/matches/mappers/MatchStateMapper', () => ({
  MatchStateMapper: {
    getUpdatesFromState: jest.fn(() => ({
      current_turn: 1,
      current_player: 1,
      phase: 'player1_turn',
      updated_at: new Date('2026-04-07T00:00:00.000Z'),
    })),
  },
}));

function createCard(params: {
  id: string;
  player: 1 | 2;
  cardType?: string;
  zone?: string;
  position?: number;
  statusEffects?: any[];
}): CardInGameState {
  return {
    instance_id: params.id,
    card_id: `card-${params.id}`,
    card_type: params.cardType ?? 'knight',
    player_number: params.player,
    zone: params.zone ?? 'hand',
    position: params.position ?? 0,
    mode: 'normal',
    is_exhausted: false,
    attacked_this_turn: false,
    status_effects: params.statusEffects ?? [],
    card_code: `code-${params.id}`,
    tags: [],
    raw_abilities: [],
    ce: 3,
    ar: 2,
    current_health: 5,
    max_health: 5,
    current_cosmos: 0,
    base_ce: 3,
    base_ar: 2,
  };
}

describe('MatchRepository regressions', () => {
  const mockedCardInPlayUpdate = CardInPlay.update as jest.Mock;
  const mockedGetUpdatesFromState = MatchStateMapper.getUpdatesFromState as jest.Mock;

  beforeEach(() => {
    mockedCardInPlayUpdate.mockReset();
    mockedCardInPlayUpdate.mockResolvedValue([0]);
    mockedGetUpdatesFromState.mockClear();
  });

  test('executePlayCard preserves scenario as a full in-state card', () => {
    const state = createEmptyGameState('match-scenario-state');
    state.player1.cosmos = 5;
    state.player1.hand.push(
      createCard({
        id: 'scenario-1',
        player: 1,
        cardType: 'stage',
        zone: 'hand',
        statusEffects: [{ type: 'ward', remaining_turns: 2 }],
      }),
    );

    const { newState } = CardRulesEngine.executePlayCard(
      state,
      1,
      'scenario-1',
      'field_scenario',
      0,
      { cost: 2, generate: 0, card_type: 'stage' },
    );

    expect(newState.player1.hand).toHaveLength(0);
    expect(newState.scenario).toMatchObject({
      instance_id: 'scenario-1',
      card_id: 'card-scenario-1',
      zone: 'field_scenario',
      position: 0,
      status_effects: [{ type: 'ward', remaining_turns: 2 }],
    });
  });

  test('applyState persists scenario zone and other live card positions', async () => {
    const state = createEmptyGameState('match-scenario-persist');
    const movedKnight = createCard({
      id: 'knight-1',
      player: 1,
      cardType: 'knight',
      zone: 'field_knight',
      position: 2,
    });

    state.player1.field_knights.push(movedKnight);
    state.scenario = {
      ...createCard({
        id: 'scenario-1',
        player: 1,
        cardType: 'stage',
        zone: 'field_scenario',
        position: 0,
      }),
      card_name: 'Santuario',
      effect: '',
    } as GameScenario;

    const match = {
      id: 'match-scenario-persist',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const transaction = { id: 'tx-1' };

    await MatchRepository.applyState(match as any, state, transaction);

    expect(match.save).toHaveBeenCalledWith({ transaction });

    const perCardCalls = mockedCardInPlayUpdate.mock.calls.filter(
      ([, options]) => options?.where?.id && !options?.where?.id[Op.notIn],
    );

    expect(perCardCalls).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({ zone: 'field_knight', position: 2 }),
          expect.objectContaining({ where: { id: 'knight-1' }, transaction }),
        ],
        [
          expect.objectContaining({ zone: 'field_scenario', position: 0 }),
          expect.objectContaining({ where: { id: 'scenario-1' }, transaction }),
        ],
      ]),
    );

    const cleanupCall = mockedCardInPlayUpdate.mock.calls.find(
      ([, options]) => Boolean(options?.where?.id?.[Op.notIn]),
    );

    expect(cleanupCall?.[1]?.where?.id?.[Op.notIn]).toEqual(
      expect.arrayContaining(['knight-1', 'scenario-1']),
    );
  });
});