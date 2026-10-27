const mockProcessedAction = {
  findOne: jest.fn(),
};

jest.mock('../../src/infrastructure/database/models/ProcessedAction', () => ({
  __esModule: true,
  default: mockProcessedAction,
}));

import ProcessedAction from '../../src/infrastructure/database/models/ProcessedAction';
import { ProcessedActionsRegistry } from '../../src/infrastructure/database/repositories/ProcessedActionsRegistry';

const actionId = '11111111-1111-4111-8111-111111111111';
const lookup = {
  matchId: 'match-1',
  playerNumber: 1 as const,
  actionType: 'attack',
};

describe('ProcessedActionsRegistry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('propagates database errors instead of treating them as an unprocessed action', async () => {
    const databaseError = new Error('database unavailable');
    mockProcessedAction.findOne.mockRejectedValue(databaseError);

    await expect(ProcessedActionsRegistry.find(actionId, lookup)).rejects.toBe(databaseError);
  });

  test('uses the transaction for the idempotency check and rejects action ID reuse', async () => {
    const transaction = {} as any;
    mockProcessedAction.findOne.mockResolvedValue({
      match_id: 'another-match',
      player_number: 1,
      action_type: 'attack',
    });

    await expect(
      ProcessedActionsRegistry.find(actionId, { ...lookup, transaction }),
    ).rejects.toThrow('action_id ya fue utilizado para otra acción');
    expect(ProcessedAction.findOne).toHaveBeenCalledWith({
      where: { action_id: actionId },
      transaction,
    });
  });

  test('rejects invalid action IDs before querying the database', async () => {
    await expect(ProcessedActionsRegistry.find('invalid', lookup)).rejects.toThrow(
      'action_id debe ser un UUID válido',
    );
    expect(ProcessedAction.findOne).not.toHaveBeenCalled();
  });
});
