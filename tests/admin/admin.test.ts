import { isValidAdminPassword } from '../../src/app/admin/admin-auth.use-case';
import { CardAdminError, CardAdminRepository, CardAdminUseCases } from '../../src/app/admin/card-admin';
import { buildMatchInspection, toActiveMatchSummary } from '../../src/app/admin/match-inspection';

const createRepository = (): jest.Mocked<CardAdminRepository> => ({
  listCards: jest.fn().mockResolvedValue({ total: 0, cards: [] }),
  findCardDetail: jest.fn(),
  saveCard: jest.fn(),
  getCardUsage: jest.fn(),
  deleteCard: jest.fn(),
});

describe('admin password', () => {
  test('accepts only the exact password', () => {
    expect(isValidAdminPassword('secreto', 'secreto')).toBe(true);
    expect(isValidAdminPassword('secret', 'secreto')).toBe(false);
    expect(isValidAdminPassword('', 'secreto')).toBe(false);
    expect(isValidAdminPassword(undefined, 'secreto')).toBe(false);
    expect(isValidAdminPassword(['secreto'], 'secreto')).toBe(false);
  });
});

describe('CardAdminUseCases', () => {
  test('caps list limit at 200', async () => {
    const repository = createRepository();
    await new CardAdminUseCases(repository).listCards({}, 10_000, 0);

    expect(repository.listCards).toHaveBeenCalledWith({}, 200, 0);
  });

  test('notifies card changes after create and update', async () => {
    const repository = createRepository();
    repository.saveCard.mockResolvedValue({ id: 'card-1' });
    const onCardChanged = jest.fn();
    const useCases = new CardAdminUseCases(repository, onCardChanged);

    await useCases.createCard({ code: 'X', name: 'Seiya', type: 'knight', rarity: 'common' });
    await useCases.updateCard('card-1', { name: 'Seiya' });

    expect(onCardChanged).toHaveBeenCalledTimes(2);
    expect(onCardChanged).toHaveBeenCalledWith('card-1');
  });

  test('does not notify when save fails', async () => {
    const repository = createRepository();
    repository.saveCard.mockRejectedValue(new CardAdminError(409, 'Ya existe'));
    const onCardChanged = jest.fn();

    await expect(new CardAdminUseCases(repository, onCardChanged).createCard({ code: 'X', name: 'Seiya', type: 'knight', rarity: 'common' })).rejects.toMatchObject({ status: 409 });
    expect(onCardChanged).not.toHaveBeenCalled();
  });

  test('refuses to delete a card in use and reports where', async () => {
    const repository = createRepository();
    repository.findCardDetail.mockResolvedValue({ id: 'card-1' });
    repository.getCardUsage.mockResolvedValue({ owners: 2, decks: 0, activeMatches: 1 });

    await expect(new CardAdminUseCases(repository).deleteCard('card-1')).rejects.toMatchObject({
      status: 409,
      details: { en_inventarios: 2, en_mazos: 0, en_partidas: 1 },
    });
    expect(repository.deleteCard).not.toHaveBeenCalled();
  });

  test('deletes an unused card and notifies', async () => {
    const repository = createRepository();
    repository.findCardDetail.mockResolvedValue({ id: 'card-1' });
    repository.getCardUsage.mockResolvedValue({ owners: 0, decks: 0, activeMatches: 0 });
    repository.deleteCard.mockResolvedValue(true);
    const onCardChanged = jest.fn();

    await new CardAdminUseCases(repository, onCardChanged).deleteCard('card-1');

    expect(onCardChanged).toHaveBeenCalledWith('card-1');
  });

  test('missing card is a 404', async () => {
    const repository = createRepository();
    repository.findCardDetail.mockResolvedValue(null);

    await expect(new CardAdminUseCases(repository).getCard('x')).rejects.toMatchObject({ status: 404 });
    await expect(new CardAdminUseCases(repository).deleteCard('x')).rejects.toMatchObject({ status: 404 });
  });
});

describe('match inspection', () => {
  const match = {
    id: 'm-1',
    phase: 'player1_turn',
    current_turn: 3,
    current_player: 1,
    created_at: '2026-10-25T10:00:00Z',
    player1_id: 'u-1',
    player2_id: null,
    player1: { username: 'seiya' },
    player1_life: 5,
    player2_life: 4,
    player1_cosmos: 2,
    player2_cosmos: 1,
    player1_deck_order: JSON.stringify(['a', 'b', 'c']),
    player1_deck_index: 1,
    cards_in_play: [
      { id: 'c-2', card_id: 'k', player_number: 1, zone: 'hand', position: 2, status_effects: 'not json', card: { name: 'B' } },
      { id: 'c-1', card_id: 'k', player_number: 1, zone: 'hand', position: 1, can_attack_this_turn: true, card: { name: 'A', card_knight: { cosmos: 1, defense: 2, health: 3, attack: 4 } } },
      { id: 'c-3', card_id: 'k', player_number: 2, zone: 'deck', position: 0 },
    ],
  };

  test('summary keeps the panel contract', () => {
    expect(toActiveMatchSummary(match)).toMatchObject({
      player1: { id: 'u-1', username: 'seiya' },
      player2: { id: null, username: '(vacío)' },
      created_at: '2026-10-25T10:00:00Z',
    });
  });

  test('builds zones sorted by position, merges actions of both players and counts decks', () => {
    const resolve = jest.fn((cards: any[], state: any) =>
      cards.map((c) => ({ id: c.id, valid_actions: c.player_number === state.current_player ? ['attack'] : null }))
    );

    const result = buildMatchInspection(match, resolve);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(result.zones.player1.hand.map((c: any) => c.instance_id)).toEqual(['c-1', 'c-2']);
    expect(result.zones.player1.hand[0]).toMatchObject({
      valid_actions: ['attack'],
      knight: { ce: 1, ar: 2, hp: 3, atk: 4 },
    });
    expect(result.zones.player1.hand[1].status_effects).toEqual([]);
    expect(result.zones.player2.deck[0].valid_actions).toEqual(['attack']);
    expect(result.player1.deck_remaining).toBe(2);
    expect(result.player2.deck_remaining).toBe(1);
  });
});
