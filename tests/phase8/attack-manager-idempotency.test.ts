import { AttackManager } from '../../src/services/game/attackManager';
import { ProcessedActionsRegistry } from '../../src/services/registries/ProcessedActionsRegistry';

jest.mock('../../src/services/registries/ProcessedActionsRegistry', () => ({
  ProcessedActionsRegistry: {
    find: jest.fn(),
    register: jest.fn(),
  },
}));

describe('AttackManager idempotency cache', () => {
  test('retry returns cached evaded value', async () => {
    (ProcessedActionsRegistry.find as jest.Mock).mockResolvedValue({
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
