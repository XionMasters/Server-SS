import { CardInGameState, GameState, Player } from "../GameState";

export type CombatContext = {
  state: GameState;
  attacker: CardInGameState;
  defender?: CardInGameState;
  defenderPlayer: Player;
};

export type CombatResult = {
  damageToCard: number;
  evaded: boolean;
};

/**
 * Busca una carta en todas las zonas de campo de un jugador por instance_id.
 * Compartida por AttackRulesEngine y AttackEffectRegistry.
 */
export function findCardInPlayerField(player: Player, cardId: string): CardInGameState | null {
  for (const zone of [player.field_knights, player.field_techniques] as CardInGameState[][]) {
    const found = zone.find(c => c.instance_id === cardId);
    if (found) return found;
  }
  const singles: (CardInGameState | null)[] = [player.field_helper, player.field_occasion];
  for (const card of singles) {
    if (card?.instance_id === cardId) return card;
  }
  return null;
}