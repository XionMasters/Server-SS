import { createEmptyGameState, type CardInGameState } from '../../src/domain/game/GameState';

jest.mock('../../src/config/database', () => ({
  sequelize: {
    transaction: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/CardInPlay', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/Card', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/CardKnight', () => ({
  __esModule: true,
  default: class CardKnight {},
}));

jest.mock('../../src/infrastructure/database/models/CardTechnique', () => ({
  __esModule: true,
  default: class CardTechnique {},
}));

jest.mock('../../src/infrastructure/database/models/CardAbility', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
  },
}));

jest.mock('../../src/app/matches/mappers/MatchStateMapper', () => ({
  MatchStateMapper: {
    fromMatch: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/repositories/MatchRepository', () => ({
  MatchRepository: {
    applyState: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/repositories/ProcessedActionsRegistry', () => ({
  ProcessedActionsRegistry: {
    find: jest.fn(),
    register: jest.fn(),
  },
}));

jest.mock('../../src/domain/game/EngineContext', () => ({
  createEngineContext: jest.fn((state: any) => ({
    state,
    bus: {
      events: [],
      emit: jest.fn(),
    },
  })),
}));

jest.mock('../../src/domain/game/events/GameEvents', () => ({
  GameEventType: {
    CARD_PLAYED: 'CARD_PLAYED',
  },
  createEvent: jest.fn((event: any) => event),
}));

jest.mock('../../src/domain/game/abilities/AbilityEngine', () => ({
  AbilityEngine: {
    getCardEntryEffects: jest.fn(() => []),
  },
}));

import { sequelize } from '../../src/config/database';
import CardInPlay from '../../src/infrastructure/database/models/CardInPlay';
import Card from '../../src/infrastructure/database/models/Card';
import CardAbility from '../../src/infrastructure/database/models/CardAbility';
import { MatchStateMapper } from '../../src/app/matches/mappers/MatchStateMapper';
import { MatchRepository } from '../../src/infrastructure/database/repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../../src/infrastructure/database/repositories/ProcessedActionsRegistry';
import { CardManager } from '../../src/app/matches/actions/cardManager';
import { KnightManager } from '../../src/app/matches/actions/knightManager';

function createTx() {
  return { LOCK: { UPDATE: 'UPDATE' } };
}

function createCard(params: {
  id: string;
  player: 1 | 2;
  cardType?: string;
  zone?: string;
  position?: number;
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
    status_effects: [],
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

describe('Manager zone regressions', () => {
  const mockedTransaction = sequelize.transaction as jest.Mock;
  const mockedCardInPlayFindAll = CardInPlay.findAll as jest.Mock;
  const mockedCardInPlayFindOne = CardInPlay.findOne as jest.Mock;
  const mockedCardFindOne = Card.findOne as jest.Mock;
  const mockedCardAbilityFindAll = CardAbility.findAll as jest.Mock;
  const mockedFromMatch = MatchStateMapper.fromMatch as jest.Mock;
  const mockedApplyState = MatchRepository.applyState as jest.Mock;
  const mockedRegistryFind = ProcessedActionsRegistry.find as jest.Mock;
  const mockedRegistryRegister = ProcessedActionsRegistry.register as jest.Mock;

  beforeEach(() => {
    mockedTransaction.mockReset();
    mockedTransaction.mockImplementation(async (callback: any) => callback(createTx()));

    mockedCardInPlayFindAll.mockReset();
    mockedCardInPlayFindOne.mockReset();
    mockedCardFindOne.mockReset();
    mockedCardAbilityFindAll.mockReset();
    mockedFromMatch.mockReset();
    mockedApplyState.mockReset();
    mockedRegistryFind.mockReset();
    mockedRegistryRegister.mockReset();

    mockedRegistryFind.mockResolvedValue(null);
    mockedApplyState.mockResolvedValue({ success: true });
    mockedRegistryRegister.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('playCard replaces an existing scenario when it is replaceable', async () => {
    const state = createEmptyGameState('match-scenario-replaceable');
    state.player1.cosmos = 5;
    state.player1.hand.push(createCard({ id: 'stage-hand-1', player: 1, cardType: 'stage', zone: 'hand' }));
    mockedFromMatch.mockReturnValue(state);

    const match = { id: 'match-scenario-replaceable', reload: jest.fn().mockResolvedValue(undefined) };
    const handCardRecord = { card_id: 'db-stage-new', update: jest.fn().mockResolvedValue(undefined) };
    const existingScenario = {
      card_id: 'db-stage-old',
      position: 0,
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockedCardInPlayFindAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingScenario]);
    mockedCardInPlayFindOne.mockResolvedValue(handCardRecord);
    mockedCardFindOne.mockImplementation(({ where }: any) => {
      if (where.id === 'db-stage-new') return Promise.resolve({ cost: 2, generate: 0, type: 'stage', card_knight: null });
      if (where.id === 'db-stage-old') return Promise.resolve({ cost: 0, generate: 0, type: 'stage', card_knight: null });
      return Promise.resolve(null);
    });
    mockedCardAbilityFindAll.mockImplementation(({ where }: any) => {
      if (where.card_id === 'db-stage-new') return Promise.resolve([]);
      if (where.card_id === 'db-stage-old') return Promise.resolve([{ effects: {} }]);
      return Promise.resolve([]);
    });

    const result = await CardManager.playCard(
      match as any,
      1,
      'stage-hand-1',
      'field_scenario',
      0,
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(true);
    expect(existingScenario.update).toHaveBeenCalledWith({ zone: 'yomotsu' }, { transaction: createTx() });
    expect(handCardRecord.update).toHaveBeenCalledWith({ zone: 'field_scenario', position: 0 }, { transaction: createTx() });
    expect(mockedApplyState).toHaveBeenCalledWith(
      match,
      expect.objectContaining({
        scenario: expect.objectContaining({
          instance_id: 'stage-hand-1',
          zone: 'field_scenario',
          position: 0,
        }),
      }),
      expect.anything(),
    );
  });

  test('playCard rejects replacing a protected scenario', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const state = createEmptyGameState('match-scenario-locked');
    state.player1.cosmos = 5;
    state.player1.hand.push(createCard({ id: 'stage-hand-2', player: 1, cardType: 'stage', zone: 'hand' }));
    mockedFromMatch.mockReturnValue(state);

    const match = { id: 'match-scenario-locked', reload: jest.fn().mockResolvedValue(undefined) };
    const handCardRecord = { card_id: 'db-stage-new-locked', update: jest.fn().mockResolvedValue(undefined) };
    const existingScenario = {
      card_id: 'db-stage-locked',
      position: 0,
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockedCardInPlayFindAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([existingScenario]);
    mockedCardInPlayFindOne.mockResolvedValue(handCardRecord);
    mockedCardFindOne.mockImplementation(({ where }: any) => {
      if (where.id === 'db-stage-new-locked') return Promise.resolve({ cost: 2, generate: 0, type: 'stage', card_knight: null });
      if (where.id === 'db-stage-locked') return Promise.resolve({ cost: 0, generate: 0, type: 'stage', card_knight: null });
      return Promise.resolve(null);
    });
    mockedCardAbilityFindAll.mockImplementation(({ where }: any) => {
      if (where.card_id === 'db-stage-new-locked') return Promise.resolve([]);
      if (where.card_id === 'db-stage-locked') return Promise.resolve([{ effects: { cannot_be_replaced: true } }]);
      return Promise.resolve([]);
    });

    const result = await CardManager.playCard(
      match as any,
      1,
      'stage-hand-2',
      'field_scenario',
      0,
      '22222222-2222-4222-8222-222222222222',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('no puede ser reemplazado');
    expect(existingScenario.update).not.toHaveBeenCalled();
    expect(handCardRecord.update).not.toHaveBeenCalled();
    expect(mockedApplyState).not.toHaveBeenCalled();
  });

  test('moveKnight passes the updated position through applyState', async () => {
    const state = createEmptyGameState('match-move-knight');
    state.current_player = 1;
    state.phase = 'player1_turn';
    state.player1.field_knights.push(createCard({ id: 'knight-1', player: 1, zone: 'field_knight', position: 0 }));
    mockedFromMatch.mockReturnValue(state);

    const match = { id: 'match-move-knight', reload: jest.fn().mockResolvedValue(undefined) };
    mockedCardInPlayFindAll.mockResolvedValueOnce([]);
    mockedCardInPlayFindOne
      .mockResolvedValueOnce({ id: 'knight-1', position: 0 })
      .mockResolvedValueOnce(null);

    const result = await KnightManager.moveKnight(
      match as any,
      1,
      'knight-1',
      2,
      '33333333-3333-4333-8333-333333333333',
    );

    expect(result.success).toBe(true);
    expect(result.oldPosition).toBe(0);
    expect(result.newPosition).toBe(2);
    expect(mockedApplyState).toHaveBeenCalledWith(
      match,
      expect.objectContaining({
        player1: expect.objectContaining({
          field_knights: expect.arrayContaining([
            expect.objectContaining({ instance_id: 'knight-1', position: 2 }),
          ]),
        }),
      }),
      expect.anything(),
    );
  });
});