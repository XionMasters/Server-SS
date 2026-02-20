import Match from '../../models/Match';
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
import User from '../../models/User';

interface BuildOptions {
  perspectivePlayer?: number; // 1 o 2
}

export class GameStateBuilder {
  static async buildFromMatch(
    match: Match,
    options: BuildOptions = {}
  ): Promise<any> {
    // Incluir usuarios para obtener nombres
    const matchWithUsers = await Match.findByPk(match.id, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] }
      ]
    });

    const cardsInPlay = await CardInPlay.findAll({
      where: { match_id: match.id },
      include: [{ model: Card, as: 'card' }]
    });

    return this._build(matchWithUsers || match, cardsInPlay, options);
  }

  private static _build(
    match: Match,
    cardsInPlay: CardInPlay[],
    options: BuildOptions
  ): any {
    const perspectivePlayer = options.perspectivePlayer ?? 1;

    // Serializar cartas
    const cardsData = cardsInPlay.map((cip: any) => ({
      id: cip.id,
      instance_id: cip.id,
      card_id: cip.card_id,
      player_number: cip.player_number,
      zone: cip.zone,
      position: cip.position,
      mode: cip.is_defensive_mode ? 'defense' : 'normal',
      is_exhausted: cip.has_attacked_this_turn,

      base_data: {
        id: cip.card.id,
        name: cip.card.name,
        type: cip.card.type,
        rarity: cip.card.rarity,
        cost: cip.card.cost,
        image_url: cip.card.image_url,
        description: cip.card.description
      }
    }));

    // Contadores
    const count = (player: number, zone: string) =>
      cardsData.filter(c => c.player_number === player && c.zone === zone).length;

    return {
      match_id: match.id,

      player1_id: match.player1_id,
      player2_id: match.player2_id,
      player1_name: (match as any).player1?.username || 'Jugador 1',
      player2_name: (match as any).player2?.username || 'Jugador 2',

      player1_life: match.player1_life,
      player2_life: match.player2_life,

      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,

      player1_hand_count: count(1, 'hand'),
      player2_hand_count: count(2, 'hand'),

      player1_deck_size: count(1, 'deck'),
      player2_deck_size: count(2, 'deck'),

      current_turn: match.current_turn,
      current_player: match.current_player,
      current_phase: match.phase,

      perspective_player: perspectivePlayer,

      cards_in_play: cardsData
    };
  }
}
