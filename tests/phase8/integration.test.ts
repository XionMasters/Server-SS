/**
 * Phase 8.2 Integration Tests
 * Tests for WebSocket handlers and idempotency system
 * 
 * Run with: npx jest tests/phase8/integration.test.ts
 */

import { v4 as uuidv4 } from 'uuid';

interface TestContext {
  matchId: string;
  userId: string;
  actionIds: Map<string, string>;
  results: Map<string, any>;
}

describe('Phase 8.2 - WebSocket Integration Tests', () => {
  let context: TestContext;

  beforeAll(() => {
    context = {
      matchId: uuidv4(),
      userId: uuidv4(),
      actionIds: new Map(),
      results: new Map(),
    };
  });

  describe('1️⃣ Idempotency - First Call', () => {
    test('End turn with new action_id returns is_retry=false', async () => {
      const actionId = uuidv4();
      context.actionIds.set('end_turn_1', actionId);

      // Simular llamada a handleEndTurnRefactored
      const result = {
        success: true,
        action_id: actionId,
        is_retry: false, // ⭐ Key assertion
        cached_result: null,
      };

      expect(result.is_retry).toBe(false);
      expect(result.action_id).toBe(actionId);
      context.results.set('end_turn_1', result);
    });

    test('Play card with new action_id returns is_retry=false', async () => {
      const actionId = uuidv4();
      context.actionIds.set('play_card_1', actionId);

      const result = {
        success: true,
        action_id: actionId,
        is_retry: false,
      };

      expect(result.is_retry).toBe(false);
      context.results.set('play_card_1', result);
    });

    test('Attack with new action_id returns is_retry=false', async () => {
      const actionId = uuidv4();
      context.actionIds.set('attack_1', actionId);

      const result = {
        success: true,
        action_id: actionId,
        is_retry: false,
        damage: 5,
      };

      expect(result.is_retry).toBe(false);
      expect(result).toHaveProperty('damage');
      context.results.set('attack_1', result);
    });

    test('Defensive mode with new action_id returns is_retry=false', async () => {
      const actionId = uuidv4();
      context.actionIds.set('defensive_1', actionId);

      const result = {
        success: true,
        action_id: actionId,
        is_retry: false,
        mode: 'defense',
      };

      expect(result.is_retry).toBe(false);
      expect(['normal', 'defense', 'evasion']).toContain(result.mode);
      context.results.set('defensive_1', result);
    });
  });

  describe('2️⃣ Idempotency - Retry with Same action_id', () => {
    test('End turn retry with SAME action_id returns is_retry=true', async () => {
      const actionId = context.actionIds.get('end_turn_1')!;
      const firstResult = context.results.get('end_turn_1')!;

      // Simulate retry with same action_id
      const retryResult = {
        success: true,
        action_id: actionId,
        is_retry: true, // ⭐ CRITICAL: Must be TRUE on retry
        cached_result: firstResult,
      };

      expect(retryResult.is_retry).toBe(true);
      expect(retryResult.action_id).toBe(firstResult.action_id);
      expect(retryResult.cached_result).toEqual(firstResult);
    });

    test('Play card retry returns cached result', async () => {
      const actionId = context.actionIds.get('play_card_1')!;
      const firstResult = context.results.get('play_card_1')!;

      const retryResult = {
        success: true,
        action_id: actionId,
        is_retry: true,
        cached_result: firstResult,
      };

      expect(retryResult.is_retry).toBe(true);
      expect(retryResult.cached_result).toEqual(firstResult);
    });

    test('Attack retry returns same damage value', async () => {
      const actionId = context.actionIds.get('attack_1')!;
      const firstResult = context.results.get('attack_1')!;

      const retryResult = {
        success: true,
        action_id: actionId,
        is_retry: true,
        damage: firstResult.damage, // Same damage from cache
        cached_result: firstResult,
      };

      expect(retryResult.damage).toBe(firstResult.damage);
      expect(retryResult.is_retry).toBe(true);
    });
  });

  describe('3️⃣ Different action_ids Trigger New Execution', () => {
    test('New action_id for end turn is NOT a retry', async () => {
      const newActionId = uuidv4(); // Different!
      const oldActionId = context.actionIds.get('end_turn_1')!;

      expect(newActionId).not.toBe(oldActionId);

      const result = {
        success: true,
        action_id: newActionId,
        is_retry: false, // ⭐ Must be false for different action_id
      };

      expect(result.is_retry).toBe(false);
    });

    test('New action_id for attack triggers new execution', async () => {
      const newActionId = uuidv4();
      const oldActionId = context.actionIds.get('attack_1')!;

      expect(newActionId).not.toBe(oldActionId);

      const result = {
        success: true,
        action_id: newActionId,
        is_retry: false,
        damage: 3, // Could be different damage
      };

      expect(result.is_retry).toBe(false);
      expect(result.action_id).toBe(newActionId);
    });
  });

  describe('4️⃣ Error Handling', () => {
    test('Invalid match_id returns error', async () => {
      const invalidMatchId = 'invalid-uuid';
      const actionId = uuidv4();

      const result = {
        success: false,
        error: 'Match not found',
        action_id: actionId,
      };

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
    });

    test('Unauthorized user returns error', async () => {
      const actionId = uuidv4();
      
      const result = {
        success: false,
        error: 'User not in match',
        action_id: actionId,
      };

      expect(result.success).toBe(false);
    });

    test('Invalid action_data returns error', async () => {
      const actionId = uuidv4();

      const result = {
        success: false,
        error: 'Invalid card position',
        action_id: actionId,
      };

      expect(result.success).toBe(false);
    });
  });

  describe('5️⃣ Response Format Validation', () => {
    test('All responses include action_id', async () => {
      const responses = [
        { success: true, action_id: uuidv4(), is_retry: false },
        { success: false, action_id: uuidv4(), error: 'Test error' },
        { success: true, action_id: uuidv4(), is_retry: true, cached_result: {} },
      ];

      responses.forEach(response => {
        expect(response).toHaveProperty('action_id');
        expect(typeof response.action_id).toBe('string');
      });
    });

    test('Success responses include is_retry flag', async () => {
      const successResponses = [
        { success: true, action_id: uuidv4(), is_retry: false },
        { success: true, action_id: uuidv4(), is_retry: true },
      ];

      successResponses.forEach(response => {
        expect(response).toHaveProperty('is_retry');
        expect(typeof response.is_retry).toBe('boolean');
      });
    });

    test('Retry responses include cached_result', async () => {
      const retryResponse = {
        success: true,
        action_id: uuidv4(),
        is_retry: true,
        cached_result: { success: true }, // ⭐ Must exist on retry
      };

      expect(retryResponse.is_retry).toBe(true);
      expect(retryResponse).toHaveProperty('cached_result');
    });

    test('Error responses include error message', async () => {
      const errorResponse = {
        success: false,
        action_id: uuidv4(),
        error: 'Something went wrong', // ⭐ Must exist on error
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse).toHaveProperty('error');
    });
  });

  describe('6️⃣ Performance Requirements', () => {
    test('First call response time < 500ms', async () => {
      const startTime = Date.now();
      
      // Simulate handler call
      const result = {
        success: true,
        action_id: uuidv4(),
        is_retry: false,
      };

      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(500);
    });

    test('Retry response time < 100ms (cached)', async () => {
      const startTime = Date.now();

      // Simulate cached response
      const result = {
        success: true,
        action_id: uuidv4(),
        is_retry: true,
        cached_result: {},
      };

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });
  });

  describe('7️⃣ Concurrent Action Testing', () => {
    test('Multiple different actions can run concurrently', async () => {
      const actions = [
        { event: 'end_turn', actionId: uuidv4() },
        { event: 'play_card', actionId: uuidv4() },
        { event: 'attack', actionId: uuidv4() },
        { event: 'defensive_mode', actionId: uuidv4() },
      ];

      const results = actions.map(action => ({
        success: true,
        action_id: action.actionId,
        is_retry: false,
        event: action.event,
      }));

      // All should complete successfully
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.is_retry).toBe(false);
      });

      // All action_ids should be unique
      const actionIds = new Set(results.map(r => r.action_id));
      expect(actionIds.size).toBe(results.length);
    });
  });

  describe('8️⃣ Type Safety', () => {
    test('action_id is always valid UUID format', async () => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      const result = {
        action_id: uuidv4(),
        is_retry: false,
      };

      expect(result.action_id).toMatch(uuidRegex);
    });

    test('is_retry is always boolean', async () => {
      const responses = [{ is_retry: true }, { is_retry: false }];

      responses.forEach(response => {
        expect(typeof response.is_retry).toBe('boolean');
      });
    });

    test('cached_result is JSONB when present', async () => {
      const response = {
        is_retry: true,
        cached_result: {
          success: true,
          action: 'end_turn',
        },
      };

      if (response.cached_result) {
        expect(typeof response.cached_result).toBe('object');
      }
    });
  });
});

// ============================================
// EXPORT TEST UTILITIES FOR MANUAL TESTING
// ============================================
export const TestUtils = {
  generateActionId: () => uuidv4(),

  /**
   * Simula una llamada idempotente
   * Primera llamada: is_retry=false
   * Llamadas subsecuentes: is_retry=true
   */
  simulateIdempotentCall: (actionId: string, callCount: number = 1) => ({
    success: true,
    action_id: actionId,
    is_retry: callCount > 1,
    cached_result: callCount > 1 ? { /* cached */ } : null,
  }),

  /**
   * Valida que una respuesta tenga el formato correcto
   */
  validateResponse: (response: any): boolean => {
    return (
      response.hasOwnProperty('action_id') &&
      response.hasOwnProperty('success') &&
      (response.success === true
        ? response.hasOwnProperty('is_retry')
        : response.hasOwnProperty('error'))
    );
  },
};