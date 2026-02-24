/**
 * services/index.ts
 * 
 * Exporta todos los servicios de la arquitectura refactorizada.
 */

// Coordinadores (validación de contexto)
export { MatchesCoordinator } from './coordinators/matchesCoordinator';
export { MatchCoordinator } from './coordinators/matchCoordinator';

// Mappers (puente BD ↔ estado puro)
export { MatchStateMapper } from './mappers/MatchStateMapper';

// Repositories (persistencia)  
export { MatchRepository } from './repositories/MatchRepository';

// Registries (idempotencia)
export { ProcessedActionsRegistry } from './registries/ProcessedActionsRegistry';

// Managers (orquestación transaccional)
export { TurnManager } from './game/turnManager';
export { CardManager } from './game/cardManager';
export { AttackManager } from './game/attackManager';
