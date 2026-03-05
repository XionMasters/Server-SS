import { StatusEffect, deriveModeFromEffects, computeCeBonus, computeArBonus, parseStatusEffects } from '../../engine/StatusEffects';

export function serializeCardInPlay(cardInPlay: any) {
  // Cartas en deck: payload mínimo — el cliente solo necesita el conteo, nunca las renderiza
  if (cardInPlay.zone === 'deck') {
    return {
      id: cardInPlay.id,
      card_id: cardInPlay.card_id,
      player_number: cardInPlay.player_number,
      zone: 'deck',
      position: cardInPlay.position,
      hidden: true
    };
  }

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

  // Para partidas antiguas donde los stats se guardaron como 0,
  // hacer fallback a los valores base del CardKnight
  const effective_ce_final = effective_ce > 0 ? effective_ce : (knight?.attack ?? 0);
  const effective_ar_final = effective_ar > 0 ? effective_ar : (knight?.defense ?? 0);
  const current_health     = cardInPlay.current_health > 0 ? cardInPlay.current_health : (knight?.health ?? 0);
  const current_cosmos     = cardInPlay.current_cosmos > 0 ? cardInPlay.current_cosmos : (knight?.cosmos ?? 0);

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

  // Traducir zona interna de BD a zona que usa el cliente
  const clientZone = cardInPlay.zone === 'field_support' ? 'field_technique' : cardInPlay.zone;

  return {
    id: cardInPlay.id,
    card_id: cardInPlay.card_id,
    player_number: cardInPlay.player_number,
    zone: clientZone,
    position: cardInPlay.position,

    // Modo derivado de status_effects (fuente de verdad)
    mode,
    is_defensive_mode: mode, // alias de compatibilidad

    // Stats de instancia con boosts aplicados
    current_attack: effective_ce_final,
    current_defense: effective_ar_final,
    current_health,
    current_cosmos,

    // Máximos (del template base, necesarios para barras HP/CP en el cliente)
    max_health: knight?.health ?? cardInPlay.current_health,
    max_cosmos: knight?.cosmos ?? cardInPlay.current_cosmos,

    // Efectos activos para que el cliente los muestre
    status_effects: effects,

    can_attack_this_turn: cardInPlay.can_attack_this_turn,
    has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
    is_exhausted: cardInPlay.has_attacked_this_turn,

    // base_data: nombre que usa CardInstance.from_server_data() en Godot
    base_data: cardData
  };
}
