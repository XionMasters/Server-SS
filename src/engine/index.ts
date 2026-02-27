/**
 * engine/index.ts
 * 
 * Exporta todos los componentes del motor puro de reglas.
 * El engine es 100% independiente de BD.
 */

export { GameState, Player, CardInGameState, GameScenario, createEmptyGameState, validateGameState, resolveWinCondition } from './GameState';
export { TurnRulesEngine } from './TurnRulesEngine';
export { CardRulesEngine } from './CardRulesEngine';
export { AttackRulesEngine } from './AttackRulesEngine';
export { KnightRulesEngine } from './KnightRulesEngine';
