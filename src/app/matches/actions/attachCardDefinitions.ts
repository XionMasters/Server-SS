/**
 * attachCardDefinitions.ts
 *
 * Las cartas en juego se cargan con lock FOR UPDATE, que Postgres no permite
 * combinar con LEFT JOIN a las definiciones. Este helper carga las definiciones
 * (Card + CardKnight + CardTechnique + CardAbility) en una consulta aparte, sin lock,
 * y las cuelga de cada CardInPlay como `card` para que MatchStateMapper pueda
 * poblar card_type, tags, max_health y raw_abilities (necesarias para que
 * PassiveTriggerEngine dispare habilidades).
 */

import Card from '../../../infrastructure/database/models/Card';
import CardKnight from '../../../infrastructure/database/models/CardKnight';
import CardTechnique from '../../../infrastructure/database/models/CardTechnique';
import CardAbility from '../../../infrastructure/database/models/CardAbility';

export async function attachCardDefinitions(cardsInPlay: any[], transaction: any): Promise<void> {
  const cardIds = [...new Set(cardsInPlay.map(c => c.card_id).filter(Boolean))];
  if (cardIds.length === 0) return;

  const cards = await Card.findAll({
    where: { id: cardIds },
    include: [
      { model: CardKnight, as: 'card_knight' },
      { model: CardTechnique, as: 'card_technique' },
      { model: CardAbility, as: 'card_abilities' },
    ],
    transaction,
  });
  const byId = new Map<string, any>(cards.map((c: any) => [c.id, c]));

  for (const cardInPlay of cardsInPlay) {
    const def = byId.get(cardInPlay.card_id);
    if (def) cardInPlay.card = def;
  }
}
