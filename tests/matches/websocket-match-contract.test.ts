import { createMatchHandlers } from '../../src/interfaces/websocket/handlers/match.handler';
import Match from '../../src/infrastructure/database/models/Match';
import { GameStateBuilder } from '../../src/app/matches/actions/GameStateBuilder';
import { SelectionService } from '../../src/app/matches/actions/SelectionService';
import { StartMatchService } from '../../src/app/matches/lifecycle/startMatch.service';
import { matchesCoordinator } from '../../src/app/matches/coordinators/matchesCoordinator';
import type { AuthenticatedWebSocket } from '../../src/infrastructure/websocket/middleware/auth.middleware';
import type { WebSocketPresenceService } from '../../src/infrastructure/websocket/presence.service';
import { broadcastAdminStats } from '../../src/interfaces/websocket/handlers/admin.handler';

jest.mock('../../src/infrastructure/database/models/Match', () => ({
  __esModule: true,
  default: {
    findByPk: jest.fn(),
    findOne: jest.fn(),
  },
}));

jest.mock('../../src/app/matches/actions/GameStateBuilder', () => ({
  GameStateBuilder: { buildFromMatch: jest.fn() },
}));

jest.mock('../../src/app/matches/lifecycle/matchState.service', () => ({
  MatchStateService: { buildBroadcastMatchState: jest.fn() },
}));

jest.mock('../../src/app/matches/actions/SelectionService', () => ({
  SelectionService: { resolveSelection: jest.fn() },
}));

jest.mock('../../src/app/matches/lifecycle/startMatch.service', () => ({
  StartMatchService: {
    createNewMatch: jest.fn(),
    resumeTestMatch: jest.fn(),
  },
}));

jest.mock('../../src/app/matches/coordinators/matchesCoordinator', () => ({
  matchesCoordinator: {
    findMatchOrCreate: jest.fn(),
    getMatchState: jest.fn(),
    abandonMatch: jest.fn(),
    buildMatchUpdateEvents: jest.fn(),
  },
}));

jest.mock('../../src/interfaces/websocket/handlers/admin.handler', () => ({
  broadcastAdminStats: jest.fn(),
}));

describe('WebSocket match event contracts', () => {
  const ws = { userId: 'user-1', username: 'Athena' } as AuthenticatedWebSocket;
  const socketMap = new Map();
  const socketSets = new Map();
  const presence = {
    sendToSocket: jest.fn(),
    broadcastToUsers: jest.fn(),
    sendToUsers: jest.fn(),
    getPrimarySocketsMap: jest.fn(() => socketMap),
    getSocketSetsMap: jest.fn(() => socketSets),
  } as unknown as WebSocketPresenceService;
  const dispatchAction = jest.fn().mockResolvedValue(undefined);
  const handlers = createMatchHandlers(presence, dispatchAction).handlers;

  beforeEach(() => {
    jest.clearAllMocks();
    (presence.getPrimarySocketsMap as jest.Mock).mockReturnValue(socketMap);
    (presence.getSocketSetsMap as jest.Mock).mockReturnValue(socketSets);
  });

  test('search_match emits searching with the waiting match ID', async () => {
    (matchesCoordinator.findMatchOrCreate as jest.Mock).mockResolvedValue({
      success: true,
      status: 'searching',
      match_id: 'match-waiting',
    });

    await handlers.search_match(ws, {});

    expect(matchesCoordinator.findMatchOrCreate).toHaveBeenCalledWith(
      'user-1',
      socketMap,
      socketSets,
    );
    expect(presence.sendToSocket).toHaveBeenCalledWith(ws, 'searching', {
      message: 'Buscando rival...',
      match_id: 'match-waiting',
    });
    expect(broadcastAdminStats).toHaveBeenCalledWith(socketMap);
  });

  test('search_match sends perspective-specific match_found states to both players', async () => {
    const match = { id: 'match-pvp' };
    (matchesCoordinator.findMatchOrCreate as jest.Mock).mockResolvedValue({
      success: true,
      status: 'match_found',
      match_id: 'match-pvp',
      data: {
        player1: { id: 'user-1' },
        player2: { id: 'user-2' },
      },
    });
    (Match.findByPk as jest.Mock).mockResolvedValue(match);
    (GameStateBuilder.buildFromMatch as jest.Mock)
      .mockResolvedValueOnce({ perspective_player: 1 })
      .mockResolvedValueOnce({ perspective_player: 2 });

    await handlers.search_match(ws, {});

    expect(GameStateBuilder.buildFromMatch).toHaveBeenNthCalledWith(1, match, {
      perspectivePlayer: 1,
    });
    expect(GameStateBuilder.buildFromMatch).toHaveBeenNthCalledWith(2, match, {
      perspectivePlayer: 2,
    });
    expect(presence.broadcastToUsers).toHaveBeenCalledWith(['user-1'], 'match_found', {
      match_id: 'match-pvp',
      game_state: { perspective_player: 1 },
    });
    expect(presence.broadcastToUsers).toHaveBeenCalledWith(['user-2'], 'match_found', {
      match_id: 'match-pvp',
      game_state: { perspective_player: 2 },
    });
  });

  test('request_test_match returns match_found with the newly created match', async () => {
    const match = { match_id: 'match-test' };
    (StartMatchService.createNewMatch as jest.Mock).mockResolvedValue(match);

    await handlers.request_test_match(ws, {});

    expect(StartMatchService.createNewMatch).toHaveBeenCalledWith('user-1', 'user-1', 'TEST');
    expect(presence.sendToSocket).toHaveBeenCalledWith(ws, 'match_found', match);
  });

  test('declare_attack translates the event payload to an ATTACK action', async () => {
    await handlers.declare_attack(ws, {
      match_id: 'match-1',
      action_id: 'action-1',
      attacker_id: 'knight-1',
      defender_id: 'knight-2',
    });

    expect(dispatchAction).toHaveBeenCalledWith(ws, {
      type: 'ATTACK',
      match_id: 'match-1',
      action_id: 'action-1',
      attacker_id: 'knight-1',
      defender_id: 'knight-2',
    });
  });

  test('end_turn translates the event payload to an END_TURN action', async () => {
    await handlers.end_turn(ws, {
      match_id: 'match-1',
      action_id: 'action-2',
    });

    expect(dispatchAction).toHaveBeenCalledWith(ws, {
      type: 'END_TURN',
      match_id: 'match-1',
      action_id: 'action-2',
    });
  });

  test('abandon_test_match abandons the match and starts a replacement test match', async () => {
    const match = { match_id: 'replacement-match' };
    (matchesCoordinator.abandonMatch as jest.Mock).mockResolvedValue({ success: true });
    (StartMatchService.createNewMatch as jest.Mock).mockResolvedValue(match);

    await handlers.abandon_test_match(ws, { match_id: 'match-old' });

    expect(matchesCoordinator.abandonMatch).toHaveBeenCalledWith('match-old', 'user-1');
    expect(StartMatchService.createNewMatch).toHaveBeenCalledWith('user-1', 'user-1', 'TEST');
    expect(presence.sendToSocket).toHaveBeenCalledWith(ws, 'match_found', match);
  });

  test('request_match_state returns the state resolved for the authenticated user', async () => {
    const state = { match_id: 'match-1', perspective_player: 2 };
    (matchesCoordinator.getMatchState as jest.Mock).mockResolvedValue({
      success: true,
      data: state,
    });

    await handlers.request_match_state(ws, { match_id: 'match-1' });

    expect(matchesCoordinator.getMatchState).toHaveBeenCalledWith('match-1', 'user-1');
    expect(presence.sendToSocket).toHaveBeenCalledWith(ws, 'match_state', state);
  });

  test('use_ability forwards the target_id', async () => {
    await handlers.use_ability(ws, {
      match_id: 'match-1',
      action_id: 'action-4',
      card_id: 'knight-1',
      ability_name: 'match1',
      target_id: 'knight-9',
    });

    expect(dispatchAction).toHaveBeenCalledWith(ws, {
      type: 'USE_ABILITY',
      match_id: 'match-1',
      action_id: 'action-4',
      card_id: 'knight-1',
      ability_name: 'match1',
      target_id: 'knight-9',
    });
  });

  test('resolve_selection forwards the authenticated user and sends per-player updates', async () => {
    (SelectionService.resolveSelection as jest.Mock).mockResolvedValue({ success: true });
    (matchesCoordinator.buildMatchUpdateEvents as jest.Mock).mockResolvedValue([
      { type: 'match_update', payload: { perspective_player: 1 }, recipients: { type: 'users', userIds: ['user-1'] } },
      { type: 'match_update', payload: { perspective_player: 2 }, recipients: { type: 'users', userIds: ['user-2'] } },
    ]);

    await handlers.resolve_selection(ws, {
      match_id: 'match-1',
      selection_id: 'selection-1',
      chosen_card_id: 'card-1',
      action_id: 'action-3',
    });

    expect(SelectionService.resolveSelection).toHaveBeenCalledWith({
      match_id: 'match-1',
      user_id: 'user-1',
      selection_id: 'selection-1',
      chosen_card_id: 'card-1',
      action_id: 'action-3',
    });
    expect(matchesCoordinator.buildMatchUpdateEvents).toHaveBeenCalledWith('match-1', expect.objectContaining({
      type: 'resolve_selection',
    }));
    expect(presence.sendToUsers).toHaveBeenCalledWith(['user-1'], 'match_update', { perspective_player: 1 });
    expect(presence.sendToUsers).toHaveBeenCalledWith(['user-2'], 'match_update', { perspective_player: 2 });
    expect(presence.broadcastToUsers).not.toHaveBeenCalledWith(
      expect.arrayContaining(['user-1', 'user-2']),
      'match_update',
      expect.anything(),
    );
  });
});
