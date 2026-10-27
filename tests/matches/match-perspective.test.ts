import { getPerspectivePlayerNumber } from '../../src/app/matches/lifecycle/matchState.service';
import { applyHandVisibility } from '../../src/app/matches/serializers/handVisibility';

describe('match state perspective', () => {
  const cards = [
    {
      id: 'player-1-hand-card',
      card_id: 'card-1',
      player_number: 1,
      zone: 'hand',
      position: 0,
      card: { name: 'Carta jugador 1' },
    },
    {
      id: 'player-2-hand-card',
      card_id: 'card-2',
      player_number: 2,
      zone: 'hand',
      position: 0,
      card: { name: 'Carta jugador 2' },
    },
  ];

  it('resolves player 2 from the authenticated user ID', () => {
    expect(getPerspectivePlayerNumber('player-1', 'player-2', 'player-2')).toBe(2);
  });

  it('hides player 1 hand details from player 2', () => {
    const visibleCards = applyHandVisibility(cards, 2);

    expect(visibleCards[0]).toMatchObject({
      id: 'player-1-hand-card',
      player_number: 1,
      hidden: true,
      card_id: null,
      card: null,
    });
    expect(visibleCards[1]).toMatchObject({
      id: 'player-2-hand-card',
      player_number: 2,
      hidden: false,
      card_id: 'card-2',
      card: { name: 'Carta jugador 2' },
    });
  });

  it('does not resolve a perspective for users outside the match', () => {
    expect(getPerspectivePlayerNumber('player-1', 'player-2', 'other-user')).toBeNull();
  });
});
