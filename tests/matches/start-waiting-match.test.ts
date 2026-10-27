import { StartMatchService } from '../../src/app/matches/lifecycle/startMatch.service';
import Match from '../../src/infrastructure/database/models/Match';
import { DeckService } from '../../src/app/decks/deck.service';
import { MatchSetupService } from '../../src/app/matches/lifecycle/matchSetup.service';
import { sequelize } from '../../src/config/database';

jest.mock('../../src/app/matches/lifecycle/matchSetup.service', () => ({
  MatchSetupService: { initializeMatchCards: jest.fn() },
}));

describe('StartMatchService.startWaitingMatch', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(DeckService, 'getAndValidateActiveDeck').mockResolvedValue({
      deck: { id: 'deck-2', name: 'Mazo' },
      totalCards: 40,
    } as any);
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (fn: any) =>
      fn({ LOCK: { UPDATE: 'UPDATE' } })
    );
  });

  test('returns null without initializing cards when another player already claimed the match', async () => {
    jest.spyOn(Match, 'findOne').mockResolvedValue(null);

    const result = await StartMatchService.startWaitingMatch({ id: 'match-1' } as any, 'user-2');

    expect(result).toBeNull();
    expect(Match.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'match-1', phase: 'waiting', player2_id: null },
      skipLocked: true,
    }));
    expect(MatchSetupService.initializeMatchCards).not.toHaveBeenCalled();
  });

  test('validates the joining player deck with the match rules', async () => {
    (DeckService.getAndValidateActiveDeck as jest.Mock).mockRejectedValue(new Error('Mazo inválido'));
    const findOne = jest.spyOn(Match, 'findOne');

    await expect(StartMatchService.startWaitingMatch({ id: 'match-1' } as any, 'user-2')).rejects.toThrow('Mazo inválido');
    expect(findOne).not.toHaveBeenCalled();
  });

  test('destroys the claimed match if card setup fails', async () => {
    const claimed: any = {
      id: 'match-1',
      player1_deck_id: 'deck-1',
      save: jest.fn(),
      destroy: jest.fn().mockResolvedValue(undefined),
    };
    jest.spyOn(Match, 'findOne').mockResolvedValue(claimed);
    (MatchSetupService.initializeMatchCards as jest.Mock).mockRejectedValue(new Error('setup'));

    await expect(StartMatchService.startWaitingMatch({ id: 'match-1' } as any, 'user-2')).rejects.toThrow('setup');
    expect(claimed.player2_id).toBe('user-2');
    expect([1, 2]).toContain(claimed.current_player);
    expect(claimed.destroy).toHaveBeenCalled();
  });
});
