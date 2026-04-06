/**
 * engine/index.ts
 * 
 * Exporta todos los componentes del motor puro de reglas.
 * El engine es 100% independiente de BD.
 */

export { GameState, Player, CardInGameState, GameScenario, createEmptyGameState, validateGameState, resolveWinCondition } from './GameState';
export {
	StatusEffectType,
	StatusEffect,
	StatusEffectSource,
	deriveModeFromEffects,
	computeCeBonus,
	computeArBonus,
	computeHpBonus,
	parseStatusEffects,
	tickStatusEffects,
	setModeEffect,
	isModeEffectType,
	hasEffect,
	removeEffect,
	addOrRefreshEffect,
} from './StatusEffects';
export { TurnRulesEngine } from './TurnRulesEngine';
export { CardRulesEngine } from './CardRulesEngine';
export { AttackRulesEngine } from './AttackRulesEngine';
export { KnightRulesEngine } from './KnightRulesEngine';

// ─── Event bus & context ──────────────────────────────────────────────────────
export { GameEventBus } from './events/GameEventBus';
export { EngineContext, createEngineContext } from './EngineContext';

// ─── Motor actions (una sola puerta de entrada por operación) ─────────────────
export { applyDamage } from './actions/DamageAction';
export { killKnight }  from './actions/KillAction';
export { heal }        from './actions/HealAction';
export { drawCardState } from './actions/DrawCardAction';
export { summonKnight, type SummonFromZone } from './actions/SummonAction';
