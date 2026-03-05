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