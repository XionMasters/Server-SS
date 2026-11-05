import { MatchesCoordinator } from '../../src/app/matches/coordinators/matchesCoordinator';
import { MatchStateService } from '../../src/app/matches/lifecycle/matchState.service';
import { AbandonMatchService } from '../../src/app/matches/lifecycle/abandonMatch.service';
import { ReplayService } from '../../src/app/replays/replay.service';

jest.mock('../../src/app/matches/lifecycle/matchState.service', () => ({
  MatchStateService: { buildBroadcastMatchState: jest.fn() },
}));

jest.mock('../../src/app/matches/actions/ActionResolver', () => ({
  ActionResolver: { resolve: jest.fn((cards: any[]) => cards) },
}));

jest.mock('../../src/app/matches/lifecycle/abandonMatch.service', () => ({
  AbandonMatchService: { abandonMatch: jest.fn() },
}));

jest.mock('../../src/app/replays/replay.service', () => ({
  ReplayService: { recordFrame: jest.fn().mockResolvedValue(undefined) },
}));

const handCard = (id: string, player: number) => ({
  id,
  card_id: `card-${id}`,
  player_number: player,
  zone: 'hand',
  position: 0,
  card: { name: `Secreto ${id}` },
});

describe('MatchesCoordinator match updates', () => {
  beforeEach(() => jest.clearAllMocks());

  test('buildMatchUpdateEvents hides each opponent hand per recipient', async () => {
    (MatchStateService.buildBroadcastMatchState as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        player1_id: 'user-1',
        player2_id: 'user-2',
        current_player: 1,
        cards_in_play: [handCard('a', 1), handCard('b', 2)],
      },
    });

    const events = await new MatchesCoordinator().buildMatchUpdateEvents('match-1', { type: 'resolve_selection' });

    expect(events).toHaveLength(2);
    const [forP1, forP2] = events;
    expect(forP1.recipients.userIds).toEqual(['user-1']);
    expect(forP2.recipients.userIds).toEqual(['user-2']);

    const p1Sees = Object.fromEntries(forP1.payload.cards_in_play.map((c: any) => [c.id, c]));
    expect(p1Sees.a.hidden).toBe(false);
    expect(p1Sees.b).toMatchObject({ hidden: true, card: null, card_id: null });

    const p2Sees = Object.fromEntries(forP2.payload.cards_in_play.map((c: any) => [c.id, c]));
    expect(p2Sees.a).toMatchObject({ hidden: true, card: null, card_id: null });
    expect(p2Sees.b.hidden).toBe(false);
  });

  test('cada match_update se graba como fotograma de la repetición (estado sin perspectiva)', async () => {
    const data = {
      player1_id: 'user-1',
      player2_id: 'user-2',
      current_player: 1,
      cards_in_play: [handCard('a', 1), handCard('b', 2)],
    };
    (MatchStateService.buildBroadcastMatchState as jest.Mock).mockResolvedValue({ success: true, data });
    const engineEvents = [{ type: 'DAMAGE_DEALT' }];

    await new MatchesCoordinator().buildMatchUpdateEvents('match-1', { type: 'attack' }, engineEvents);

    expect(ReplayService.recordFrame).toHaveBeenCalledWith('match-1', data, { type: 'attack' }, engineEvents);
    // Se graba el estado completo, con ambas manos visibles: la visibilidad se aplica al reproducir
    const recorded = (ReplayService.recordFrame as jest.Mock).mock.calls[0][1];
    expect(recorded.cards_in_play.every((c: any) => c.card !== null)).toBe(true);
  });

  test('al abandonar se graba un último fotograma (cierra la repetición)', async () => {
    (AbandonMatchService.abandonMatch as jest.Mock).mockResolvedValue({ success: true, winner_id: 'user-2', player_ids: [] });
    (MatchStateService.buildBroadcastMatchState as jest.Mock).mockResolvedValue({
      success: true,
      data: { player1_id: 'user-1', player2_id: 'user-2', current_player: 1, phase: 'finished', cards_in_play: [] },
    });

    await new MatchesCoordinator().abandonMatch('match-1', 'user-1');

    expect(ReplayService.recordFrame).toHaveBeenCalledWith(
      'match-1', expect.objectContaining({ phase: 'finished' }), { type: 'abandon', abandoned_by: 'user-1' }, [],
    );
  });

  test('abandonMatch notifies both players when it succeeds', async () => {
    (AbandonMatchService.abandonMatch as jest.Mock).mockResolvedValue({
      success: true,
      winner_id: 'user-2',
      player_ids: ['user-1', 'user-2'],
    });
    const notifier = jest.fn();
    const coordinator = new MatchesCoordinator();
    coordinator.setNotifier(notifier);

    await coordinator.abandonMatch('match-1', 'user-1');

    expect(notifier).toHaveBeenCalledWith(['user-1', 'user-2'], 'match_finished', {
      match_id: 'match-1',
      winner_id: 'user-2',
      reason: 'abandon',
      abandoned_by: 'user-1',
    });
  });

  test('abandonMatch does not notify when it fails', async () => {
    (AbandonMatchService.abandonMatch as jest.Mock).mockResolvedValue({ success: false, error: 'x' });
    const notifier = jest.fn();
    const coordinator = new MatchesCoordinator();
    coordinator.setNotifier(notifier);

    await coordinator.abandonMatch('match-1', 'user-1');

    expect(notifier).not.toHaveBeenCalled();
  });
});
