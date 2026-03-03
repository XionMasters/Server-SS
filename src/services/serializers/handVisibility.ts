/**
 * handVisibility.ts
 *
 * Aplica visibilidad a las cartas de mano según perspectiva del jugador.
 *
 * Reglas:
 * - Cartas de mano del jugador visible → hidden: false, card: <datos completos>
 * - Cartas de mano del jugador oculto  → hidden: true,  card: null
 * - Cartas fuera de la mano (campo, deck, etc.) → hidden: false, sin cambios
 *
 * Cada carta conserva:
 *   - id:       ID de la instancia (CardInPlay.id) → identidad estable entre updates
 *   - position: slot en la mano (0-based) → posición visual estable
 *
 * El cliente usa `id` para detectar qué carta cambió de estado (hidden↔visible)
 * y `position` para saber en qué slot renderizarla o animar el flip.
 */

export function applyHandVisibility(
  cards: any[],
  visiblePlayerNumber: number
): any[] {
  return cards.map(card => {
    if (card.zone !== 'hand') {
      return { ...card, hidden: false };
    }

    const isVisible = card.player_number === visiblePlayerNumber;

    if (isVisible) {
      return { ...card, hidden: false };
    }

    // Ocultar: mantener id y position para que el cliente pueda trackear
    // qué slot cambió entre updates, sin revelar el contenido de la carta
    return {
      id: card.id,           // identidad estable (CardInPlay.id)
      card_id: null,         // ocultamos qué carta es
      player_number: card.player_number,
      zone: card.zone,
      position: card.position,  // slot en mano (índice estable)
      is_defensive_mode: false,
      can_attack_this_turn: false,
      has_attacked_this_turn: false,
      hidden: true,
      card: null             // sin base_data
    };
  });
}
