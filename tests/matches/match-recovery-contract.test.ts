import { Op } from 'sequelize';
import { RecoverableMatch, RecoverMatchOnConnectUseCase } from '../../src/app/matches/recover-match-on-connect.use-case';
import { SequelizeMatchRecoveryRepository } from '../../src/infrastructure/database/repositories/SequelizeMatchRecoveryRepository';
import Match from '../../src/infrastructure/database/models/Match';

jest.mock('../../src/infrastructure/database/models/Match', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    destroy: jest.fn(),
  },
}));

jest.mock('../../src/infrastructure/database/models/User', () => ({
  __esModule: true,
  default: class User {},
}));

const activeMatch: RecoverableMatch = {
  id: 'match-active',
  phase: 'player2_turn',
  player1_id: 'user-1',
  player2_id: 'user-2',
  player1_life: 9,
  player2_life: 7,
  player1_cosmos: 4,
  player2_cosmos: 6,
  current_turn: 5,
  current_player: 2,
  player1: { id: 'user-1', username: 'Athena' },
  player2: { id: 'user-2', username: 'Poseidon' },
};

describe('RecoverMatchOnConnectUseCase', () => {
  const repository = {
    clearWaitingMatches: jest.fn(),
    findActiveMatch: jest.fn(),
    deleteMatch: jest.fn(),
  };
  const useCase = new RecoverMatchOnConnectUseCase(repository);

  beforeEach(() => {
    jest.clearAllMocks();
    repository.clearWaitingMatches.mockResolvedValue(0);
    repository.findActiveMatch.mockResolvedValue(null);
    repository.deleteMatch.mockResolvedValue(undefined);
  });

  test('clears waiting matches and returns the active match when the opponent is online', async () => {
    repository.clearWaitingMatches.mockResolvedValue(1);
    repository.findActiveMatch.mockResolvedValue(activeMatch);
    const isUserOnline = jest.fn(() => true);

    const result = await useCase.execute('user-1', isUserOnline);

    expect(repository.clearWaitingMatches).toHaveBeenCalledWith('user-1');
    expect(repository.findActiveMatch).toHaveBeenCalledWith('user-1');
    expect(isUserOnline).toHaveBeenCalledWith('user-2');
    expect(repository.deleteMatch).not.toHaveBeenCalled();
    expect(result).toEqual({
      cleanedWaitingCount: 1,
      matchResumed: {
        match_id: 'match-active',
        phase: 'player2_turn',
        player1: { id: 'user-1', username: 'Athena' },
        player2: { id: 'user-2', username: 'Poseidon' },
        player1_life: 9,
        player2_life: 7,
        player1_cosmos: 4,
        player2_cosmos: 6,
        current_turn: 5,
        current_player: 2,
      },
    });
  });

  test('does not resume a PvP match if the opponent is offline', async () => {
    repository.findActiveMatch.mockResolvedValue(activeMatch);

    const result = await useCase.execute('user-1', () => false);

    expect(repository.deleteMatch).toHaveBeenCalledWith('match-active');
    expect(result).toEqual({ cleanedWaitingCount: 0 });
  });

  test('resumes a test match without requiring a second online socket', async () => {
    repository.findActiveMatch.mockResolvedValue({
      ...activeMatch,
      player2_id: 'user-1',
      player2: { id: 'user-1', username: 'Athena' },
    });
    const isUserOnline = jest.fn(() => false);

    const result = await useCase.execute('user-1', isUserOnline);

    expect(isUserOnline).not.toHaveBeenCalled();
    expect(repository.deleteMatch).not.toHaveBeenCalled();
    expect(result.matchResumed?.match_id).toBe('match-active');
  });

  test('deletes an active match whose player association is missing', async () => {
    repository.findActiveMatch.mockResolvedValue({ ...activeMatch, player2: null });

    const result = await useCase.execute('user-1', () => true);

    expect(repository.deleteMatch).toHaveBeenCalledWith('match-active');
    expect(result).toEqual({ cleanedWaitingCount: 0 });
  });

  test('returns the waiting-match cleanup count when there is no active match', async () => {
    repository.clearWaitingMatches.mockResolvedValue(2);

    await expect(useCase.execute('user-1', () => false)).resolves.toEqual({
      cleanedWaitingCount: 2,
    });
  });
});

describe('SequelizeMatchRecoveryRepository', () => {
  const repository = new SequelizeMatchRecoveryRepository();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('destroys stale waiting matches and reports how many were cleared', async () => {
    const waitingMatches = [
      { destroy: jest.fn().mockResolvedValue(undefined) },
      { destroy: jest.fn().mockResolvedValue(undefined) },
    ];
    (Match.findAll as jest.Mock).mockResolvedValue(waitingMatches);

    await expect(repository.clearWaitingMatches('user-1')).resolves.toBe(2);

    expect(Match.findAll).toHaveBeenCalledWith({
      where: { player1_id: 'user-1', phase: 'waiting' },
    });
    expect(waitingMatches[0].destroy).toHaveBeenCalled();
    expect(waitingMatches[1].destroy).toHaveBeenCalled();
  });

  test('loads an active match with participant identities and active phases only', async () => {
    const match = {
      id: 'match-active',
      phase: 'player1_turn',
      player1_id: 'user-1',
      player2_id: 'user-2',
      player1_life: 11,
      player2_life: 10,
      player1_cosmos: 1,
      player2_cosmos: 0,
      current_turn: 1,
      current_player: 1,
      get: (association: string) => ({
        player1: { username: 'Athena' },
        player2: { username: 'Poseidon' },
      })[association],
    };
    (Match.findOne as jest.Mock).mockResolvedValue(match);

    await expect(repository.findActiveMatch('user-1')).resolves.toMatchObject({
      id: 'match-active',
      player1: { id: 'user-1', username: 'Athena' },
      player2: { id: 'user-2', username: 'Poseidon' },
    });

    const query = (Match.findOne as jest.Mock).mock.calls[0][0];
    expect(query.where[Op.or]).toHaveLength(2);
    expect(query.where[Op.or][0]).toEqual({
      player1_id: 'user-1',
      phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] },
    });
    expect(query.include.map((item: { as: string }) => item.as)).toEqual(['player1', 'player2']);
  });

  test('deletes a match by identifier', async () => {
    (Match.destroy as jest.Mock).mockResolvedValue(1);

    await repository.deleteMatch('match-stale');

    expect(Match.destroy).toHaveBeenCalledWith({ where: { id: 'match-stale' } });
  });
});
