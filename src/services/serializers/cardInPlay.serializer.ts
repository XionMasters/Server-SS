import { StatusEffect, deriveModeFromEffects, computeCeBonus, computeArBonus, parseStatusEffects } from '../../engine/StatusEffects';

export function serializeCardInPlay(cardInPlay: any) {
  const card = cardInPlay.get('card') as any;
  const knight = card?.card_knight;

  // Parsear status_effects desde BD
  const effects: StatusEffect[] = parseStatusEffects(cardInPlay.status_effects);

  // Derivar mode y boosts desde efectos
  const mode = deriveModeFromEffects(effects);
  const base_ce = cardInPlay.current_attack ?? 0;
  const base_ar = cardInPlay.current_defense ?? 0;
  const effective_ce = base_ce + computeCeBonus(effects);
  const effective_ar = base_ar + computeArBonus(effects);

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

    // Modo derivado de status_effects (fuente de verdad)
    mode,
    is_defensive_mode: mode, // alias de compatibilidad

    // Stats con boosts aplicados
    current_attack: effective_ce,
    current_defense: effective_ar,
    current_health: cardInPlay.current_health,
    current_cosmos: cardInPlay.current_cosmos,

    // Efectos activos para que el cliente los muestre
    status_effects: effects,

    can_attack_this_turn: cardInPlay.can_attack_this_turn,
    has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
    is_exhausted: cardInPlay.has_attacked_this_turn,

    card: cardData
  };
}
