export function serializeCardInPlay(cardInPlay: any) {
  const card = cardInPlay.get('card') as any;
  const knight = card?.card_knight;

  const cardData: any = {
    id: card?.id,
    name: card?.name,
    type: card?.type,
    rarity: card?.rarity,
    cost: card?.cost,
    generate: card?.generate,
    image_url: card?.image_url,
    description: card?.description,
    faction: card?.faction || '',
    element: card?.element || ''
  };

  if (knight) {
    cardData.card_knight = {
      attack: knight.attack || 0,
      defense: knight.defense || 0,
      health: knight.health || 0,
      cosmos: knight.cosmos || 0,
      can_defend: knight.can_defend !== undefined ? knight.can_defend : true,
      defense_reduction: knight.defense_reduction || 0.5
    };
  }

  return {
    id: cardInPlay.id,
    card_id: cardInPlay.card_id,
    player_number: cardInPlay.player_number,
    zone: cardInPlay.zone,
    position: cardInPlay.position,
    is_defensive_mode: cardInPlay.is_defensive_mode,
    current_attack: cardInPlay.current_attack,
    current_defense: cardInPlay.current_defense,
    current_health: cardInPlay.current_health,
    current_cosmos: cardInPlay.current_cosmos,
    can_attack_this_turn: cardInPlay.can_attack_this_turn,
    has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
    card: cardData
  };
}
