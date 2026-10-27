import { AttackManager } from '../../src/app/matches/actions/attackManager';
import { ProcessedActionsRegistry } from '../../src/infrastructure/database/repositories/ProcessedActionsRegistry';

jest.mock('../../src/infrastructure/database/repositories/ProcessedActionsRegistry', () => ({
  ProcessedActionsRegistry: {
    find: jest.fn(),
    register: jest.fn(),
  },
}));

describe('AttackManager idempotency cache', () => {
  test('retry returns cached evaded value', async () => {
    (ProcessedActionsRegistry.find as jest.Mock).mockResolvedValue({
      match_id: 'm1',
      player_number: 1,
      action_type: 'attack',
      cached_result: {
        newState: { match_id: 'm1' },
        damage: 0,
        evaded: true,
      },
    });

    const result = await AttackManager.attack(
      { id: 'm1' } as any,
      1,
      'attacker-1',
      'defender-1',
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result.success).toBe(true);
    expect(result.isRetry).toBe(true);
    expect(result.evaded).toBe(true);
    expect(result.damage).toBe(0);
    expect(result.newState).toEqual({ match_id: 'm1' });
  });
});
