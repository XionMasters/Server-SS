import { StatusEffect, deriveModeFromEffects, computeCeBonus, computeArBonus, parseStatusEffects } from '../../../domain/game/StatusEffects';
import { ZoneMapper } from '../../../domain/game/ZoneMapper';
import { parseAttachedCards } from '../mappers/MatchStateMapper';

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
  const technique = card?.card_technique;

  // Parsear status_effects desde BD
  const effects: StatusEffect[] = parseStatusEffects(cardInPlay.status_effects);

  // Derivar mode y boosts desde efectos
  const mode = deriveModeFromEffects(effects);
  const base_ce = cardInPlay.current_attack ?? 0;
  const base_ar = cardInPlay.current_defense ?? 0;
  const effective_ce = base_ce + computeCeBonus(effects);
  const effective_ar = base_ar + computeArBonus(effects);

  // Fuera del campo (mano, mazo, yomotsu) los stats se guardan como 0: se muestran los base
  // del CardKnight. En el campo 0 es un valor real (cosmos gastado, AR reducida) y se respeta.
  const onField = cardInPlay.zone === 'field_knight';
  const orBase = (value: number, base: number | undefined) => (onField || value > 0 ? value : (base ?? 0));
  const effective_ce_final = orBase(effective_ce, knight?.attack);
  const effective_ar_final = orBase(effective_ar, knight?.defense);
  const current_health     = cardInPlay.current_health > 0 ? cardInPlay.current_health : (knight?.health ?? 0);
  const current_cosmos     = orBase(cardInPlay.current_cosmos ?? 0, knight?.cosmos);

  const cardData: any = {
    id: card?.id,
    code: card?.code,
    name: card?.name,
    type: card?.type,
    rarity: card?.rarity,
    cost: card?.cost,
    generate: card?.generate,
    image_url: card?.image_url,
    description: card?.description,
    faction: card?.faction || '',
    element: card?.element || '',
    tags: card?.tags || [],
    character: card?.character ?? null,
    unique: card?.unique === true,
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

  // Habilidades (si se cargaron): ActionResolver las evalúa para ofrecer las activas
  if (Array.isArray(card?.card_abilities)) {
    cardData.abilities = card.card_abilities.map((a: any) => ({
      name: a.name,
      ability_key: a.ability_key ?? null,
      type: a.type,
      description: a.description ?? '',
      effects: a.effects,
    }));
  }

  if (technique) {
    cardData.card_technique = {
      hit_count: technique.hit_count || 1,
      hit_ce: technique.hit_ce || 0,
      ta_cost: technique.ta_cost || 0,
      compatible_tags: technique.compatible_tags || [],
      // Si true, golpea a todos los caballeros rivales: el cliente no pide objetivo
      target_all: technique.target_all === true,
    };
  }

  // Traducir zona interna de BD a zona que usa el cliente
  const clientZone = ZoneMapper.toClient(cardInPlay.zone);

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

    // Objetos equipados (instance_ids): el cliente los muestra en el caballero y en el objeto
    attached_cards: cardInPlay.zone === 'field_knight' ? parseAttachedCards(cardInPlay.attached_cards) : [],

    can_attack_this_turn: cardInPlay.can_attack_this_turn,
    has_attacked_this_turn: cardInPlay.has_attacked_this_turn,
    is_exhausted: cardInPlay.has_attacked_this_turn,

    // base_data: nombre que usa CardInstance.from_server_data() en Godot
    base_data: cardData
  };
}
