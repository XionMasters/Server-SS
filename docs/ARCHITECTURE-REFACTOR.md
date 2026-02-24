# 📐 Arquitectura del Servidor Refactorizada

## Resumen Ejecutivo

Se propone refactorizar el servidor para seguir principios **SOLID** (especialmente Single Responsibility) y establecer una arquitectura en **capas con coordinators puros**.

**Objetivo:** Sustituir la lógica monolítica de `websocket.service.ts` (2138 líneas) por servicios especializados que deleguen responsabilidades correctamente.

### 🧠 Decisión Arquitectónica Clave: GameRulesEngine

**GameRulesEngine NO es un servicio más.** Es un **motor puro de reglas**:

- ✅ **Determinístico** - Misma entrada = mismo resultado
- ✅ **Sin BD** - No toca Sequelize, Redis, sockets
- ✅ **Testeable offline** - Sin levantar servidor
- ✅ **Simulable** - Habilita IA, replay, validación
- ✅ **Reproducible** - Debuggear fácil

```typescript
// Ejemplo: TurnRulesEngine
const result = TurnRulesEngine.endTurn(gameState, playerNumber);
// ↓
// { newState: GameState }
// Sin await, sin BD, sin contexto
```

Esto significa que **TurnManager actúa como traductor** entre mundo BD (transacciones, persistencia) y mundo puro (reglas determinísticas).

---

## 📑 Índice

1. [Problemas Actuales](#problemas-actuales)
2. [Nueva Arquitectura Propuesta](#nueva-arquitectura-propuesta)
3. [Consideraciones Críticas (Production-Grade)](#consideraciones-críticas-production-grade)
   - [GameRulesEngine (MOTOR PURO)](#1️⃣-gamerulesingine-motor-puro)
   - [Transacciones Atómicas](#2️⃣-transacciones-atómicas-obligatorio)
   - [Idempotencia Real](#3️⃣-idempotencia-real-processedactions)
   - [Validaciones Contextuales](#4️⃣-validaciones-contextuales-vs-reglas-de-juego)
   - [GameStateBuilder](#5️⃣-gatestaetbuilder-serializar-dentro-de-transacción)
   - [Concurrencia](#6️⃣-concurrencia-race-conditions-futuro)
   - [Managers vs BD](#7️⃣-managers-no-deben-consultar-bd)
4. [GameRulesEngine Concreto](#-gamerulesingine-concreto-turnrulesingine)
5. [MatchesCoordinator](#matchescoordinator-operaciones-generales)
6. [MatchCoordinator](#matchcoordinator-operaciones-por-match)
7. [CPSD + Managers + GameRulesEngine](#cpsd--managers--gamerulesingine)
8. [Estructura de Carpetas](#estructura-de-carpetas-nueva)
9. [Flujo Completo](#flujo-completo-fin-de-turno)
10. [Pasos de Implementación](#pasos-de-implementación)
11. [Checklists](#checklists-de-validación)

---

## 🔴 Problemas Actuales

### 1. Monolito de WebSocket (websocket.service.ts)
- ❌ 2138 líneas en UN archivo
- ❌ Mezcla de lógica: búsqueda, validación, turnos, cartas, combate
- ❌ Difícil de testear
- ❌ Búsquedas duplicadas a BD (validateEndTurn + endTurn buscan Match 2 veces)
- ❌ Hardcodeo de valores (cosmos=10, cosmos_per_turn=1)

### 2. Falta de Separación de Responsabilidades
- ❌ ¿Qué valida? ¿Quién ejecuta? ¿Quién serializa?
- ❌ Responsabilidades mezcladas en GameLogicService

### 3. Servicios Incompletos
- ⚠️ `TurnManager` solo tiene `startTurn()`, falta `endTurn()`
- ⚠️ `CardManager` existe pero no está integrado
- ⚠️ `GameStateBuilder` existe pero no se usa

---

## ✅ Nueva Arquitectura Propuesta (Production-Grade)

### Capas (Bottom-Up)

```
┌─────────────────────────────────────────────────────────┐
│              WebSocket Handlers                         │
│          (punto de entrada de eventos)                  │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│      COORDINATORS (Validación Contextual + Orq.)        │
├─────────────────────────────────────────────────────────┤
│ Validaciones CONTEXTUALES (no reglas):                  │
│ ✅ ¿Match existe?                                       │
│ ✅ ¿Usuario pertenece al match?                         │
│ ✅ ¿Match está activo?                                  │
│ ❌ (NO valida reglas - eso es GameRulesEngine)         │
│                                                         │
│ • MatchesCoordinator (operaciones generales)           │
│ • MatchCoordinator (operaciones por match)             │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  GAME RULES ENGINE (PURO - Sin BD, determinístico)     │
├─────────────────────────────────────────────────────────┤
│ ⚠️ CRÍTICO: No toca BD, recibe estado en memoria       │
│ ✅ Determinístico (misma entrada = mismo resultado)    │
│ ✅ Testeable sin BD                                     │
│ ✅ Simulable, replayable, offline-validable           │
│                                                         │
│ • TurnRulesEngine.validateEndTurn()                    │
│ • TurnRulesEngine.endTurn(currentState)               │
│ • CardRulesEngine.validatePlayCard()                  │
│ • CardRulesEngine.playCard(currentState)              │
│ • AttackRulesEngine.validateAttack()                  │
│ • AttackRulesEngine.performAttack(currentState)       │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│  MANAGERS (Infraestructura + Persistencia)              │
├─────────────────────────────────────────────────────────┤
│ ⚠️ CRÍTICO: Transactions ATÓMICAS siempre              │
│ ✅ Idempotencia real (ProcessedActions registry)       │
│ ✅ Locking por match (previene race conditions)        │
│ ✅ Reciben objetos, NO buscan en BD                    │
│                                                         │
│ • TurnManager (orquesta estado + persistencia)         │
│ • CardManager (orquesta estado + persistencia)         │
│ • AttackManager (orquesta estado + persistencia)       │
│ • MatchRepository (abstracción de persistencia)        │
│ • ProcessedActionsRegistry (idempotencia)              │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│       MAPPERS (Conversión Estado ↔ Modelo)              │
├─────────────────────────────────────────────────────────┤
│ • MatchStateMapper (Match → GameState)                 │
│ • GameStateBuilder (GameState → respuesta cliente)     │
└──────────────────────┬──────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────┐
│          MODELS (Sequelize + BD)                        │
├─────────────────────────────────────────────────────────┤
│ • Match, Card, CardInPlay, User, ProcessedActions      │
│ • + Transactional Support                              │
└─────────────────────────────────────────────────────────┘
```

---

## � CONSIDERACIONES CRÍTICAS (Production-Grade)

### 1️⃣ GameRulesEngine: Lógica Pura sin BD

**Problema Actual:**
```typescript
// ❌ Mezcla mutación + persistencia
match.current_player = nextPlayer;
await match.save();
await this.startTurn(match.id, nextPlayer);
```

Esto hace que sea imposible:
- ❌ Simular IA
- ❌ Reproducir partida
- ❌ Hacer replay
- ❌ Validar jugadas offline

**Solución Correcta:**

```typescript
// 1️⃣ Obtener snapshot del estado actual
const currentState = MatchStateMapper.fromMatch(match);

// 2️⃣ Ejecutar motor de reglas PURO (determinístico)
const result = await TurnRulesEngine.endTurn(currentState, playerNumber, actionId);
if (!result.valid) {
  return { success: false, error: result.error };
}

// 3️⃣ Persistir cambios ATÓMICAMENTE
await sequelize.transaction(async (t) => {
  await MatchRepository.applyState(match, result.newState, t);
  await ProcessedActionsRegistry.register(actionId, match.id, playerNumber, t);
});

// 4️⃣ Serializar DENTRO de la transacción
const matchState = await GameStateBuilder.buildFromMatch(match);
return { success: true, matchState };
```

**Ventajas:**
- ✅ `TurnRulesEngine` es testeable sin BD
- ✅ Determinístico (= reproducible)
- ✅ Simulable para IA
- ✅ Validable offline
- ✅ Fácil de debuggear

---

### 2️⃣ Transacciones Atómicas (OBLIGATORIO)

**Problema Actual:**
```typescript
match.save();              // Si falla aquí → match en estado inconsistente
startTurn();
drawCard();
giveCosmos();
buildState();
```

El match queda "Frankenstein" si algo falla entre medio.

**Solución Correcta:**

```typescript
export class TurnManager {
  static async endTurn(match: Match, playerNumber: 1 | 2, actionId: string) {
    return await sequelize.transaction(async (transaction) => {
      // 1️⃣ OBTENER ESTADO
      const currentState = MatchStateMapper.fromMatch(match);

      // 2️⃣ VALIDAR (dentro de transacción)
      const validation = await TurnRulesEngine.validateEndTurn(
        currentState,
        playerNumber,
        actionId
      );
      if (!validation.valid) {
        throw new ValidationError(validation.error);
      }

      // 3️⃣ EJECUTAR MOTOR PURO
      const result = await TurnRulesEngine.endTurn(currentState, playerNumber);

      // 4️⃣ APLICAR CAMBIOS (mismo nivel transaccional)
      await MatchRepository.applyState(match, result.newState, transaction);

      // 5️⃣ REGISTRAR ACCIÓN (mismo nivel transaccional)
      await ProcessedActionsRegistry.register(
        actionId,
        match.id,
        playerNumber,
        transaction
      );

      // 6️⃣ RETORNAR ÉXITO
      return { success: true, newState: result.newState };
    });
  }
}
```

**Transacción = Atomicidad Total:**
- ❌ Sin transacción: cambios parciales si falla
- ✅ Con transacción: TODO o NADA

---

### 3️⃣ Idempotencia Real (ProcessedActions)

**Problema Actual:**
```typescript
// El actionId se pasa pero NO se valida
if (await ProcessedActions.exists(actionId)) {
    return previousResult;  // ❌ Este código NO existe
}
```

Sin esto, si el cliente reintenta por timeout:
- ❌ Puede duplicar turno
- ❌ Puede duplicar robo de cartas
- ❌ Puede duplicar cosmos
- ⚠️ EN PVP ESO ES MORTAL

**Solución Correcta:**

```typescript
// 1️⃣ Verificar que acción no fue procesada
const existing = await ProcessedActionsRegistry.find(actionId);
if (existing) {
  // Retornar resultado anterior cached
  return {
    success: true,
    matchState: existing.cachedResult
  };
}

// 2️⃣ Procesar acción (en transacción)
const result = await sequelize.transaction(async (t) => {
  // ... lógica ...
  
  // 3️⃣ Registrar acción processada
  await ProcessedActionsRegistry.register(
    actionId,
    match.id,
    playerNumber,
    result.newState,
    t
  );
  
  return result;
});

return { success: true, matchState: result.matchState };
```

**Tabla ProcessedActions:**
```sql
CREATE TABLE processed_actions (
  id UUID PRIMARY KEY,
  action_id UUID UNIQUE NOT NULL,
  match_id UUID NOT NULL,
  player_number INT NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  cached_result JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  FOREIGN KEY (match_id) REFERENCES matches(id)
);
```

---

### 4️⃣ Validaciones Contextuales vs Reglas de Juego

**INCORRECTO (lo que NO debe hacer):**
```typescript
// ❌ El Coordinator NO debe validar reglas
if (playerNumber !== match.current_player) {
  return { error: 'NO ES TU TURNO' };
}
```

**CORRECTO:**

La división es así:

| Validación | Dónde | Por Qué |
|-----------|-------|--------|
| ¿Match existe? | **Coordinator** | Contexto de ejecución |
| ¿Usuario pertenece? | **Coordinator** | Contexto de autorización |
| ¿Match activo? | **Coordinator** | Contexto de estado |
| ¿Es tu turno? | **RulesEngine** | Regla de juego |
| ¿Cosmos suficiente? | **RulesEngine** | Regla de juego |
| ¿Fase válida? | **RulesEngine** | Regla de juego |

```typescript
// MatchCoordinator
static async endTurn(matchId, userId, actionId) {
  const match = await Match.findByPk(matchId);
  
  // ✅ CONTEXTUAL: ¿Existe?
  if (!match) return { error: 'Match no encontrado' };
  
  const playerNumber = this.getPlayerNumber(match, userId);
  
  // ✅ CONTEXTUAL: ¿Perteneces?
  if (!playerNumber) return { error: 'No eres jugador' };
  
  // ✅ CONTEXTUAL: ¿Activo?
  if (match.status !== 'active') return { error: 'Match finalizado' };
  
  // ❌ NO AQUÍ: ¿Es tu turno? → Delegado a RulesEngine
  return await TurnManager.endTurn(match, playerNumber, actionId);
}

// TurnRulesEngine
static async validateEndTurn(state, playerNumber) {
  // ✅ REGLA DE JUEGO: ¿Es su turno?
  if (state.current_player !== playerNumber) {
    return { valid: false, error: 'No es tu turno' };
  }
  
  // ✅ REGLA DE JUEGO: ¿Fase válida?
  if (!['player1_turn', 'player2_turn'].includes(state.phase)) {
    return { valid: false, error: 'Fase inválida' };
  }
  
  return { valid: true };
}
```

---

### 5️⃣ GameStateBuilder: Serializar Dentro de Transacción

**Problema:**
```typescript
// ❌ Si match fue mutado en memoria pero no refrescado
const matchState = await GameStateBuilder.buildFromMatch(match);
// Puedes serializar estado VIEJO
```

**Solución:**

```typescript
await sequelize.transaction(async (t) => {
  // 1️⃣ Aplicar cambios
  await MatchRepository.applyState(match, result.newState, t);
  
  // 2️⃣ OPCIÓN A: Serializar desde estado ya mutado
  const matchState = GameStateBuilder.buildFromState(result.newState);
  
  // 2️⃣ OPCIÓN B: Recargar match dentro transacción
  await match.reload({ transaction: t });
  const matchState = await GameStateBuilder.buildFromMatch(match);
  
  // 3️⃣ Retornar
  return { success: true, matchState };
});
```

**Clave:** Serializar DENTRO del mismo contexto transaccional.

---

### 6️⃣ Concurrencia: Race Conditions (Futuro)

**Problema:**
```
Jugador A manda: attack
Jugador B manda: end_turn

Ambos llegan casi simultáneamente.
¿Cuál se ejecuta primero? ¿Pueden entrar en conflicto?
```

**Solución A: MySQL Row Locking**

```typescript
await sequelize.transaction(async (t) => {
  // LOCK el match para que nadie más pueda modificarlo
  const match = await Match.findByPk(matchId, {
    lock: t.LOCK.UPDATE, // ← LOCK FOR UPDATE
    transaction: t
  });
  
  // Ahora este transaction tiene exclusividad
  // Todos los demás esperan
  
  // ... ejecutar cambios ...
});
```

**Solución B: Redis Lock**

```typescript
const lockKey = `match:${matchId}:lock`;
const lockToken = uuidv4();

// Intentar adquirir lock
const acquired = await redis.set(
  lockKey,
  lockToken,
  'EX', 30, // 30s expiration
  'NX'      // Solo si no existe
);

if (!acquired) {
  return { error: 'Match está siendo modificado, intenta de nuevo' };
}

try {
  // ... ejecutar cambios ...
} finally {
  // Liberar lock
  await redis.del(lockKey);
}
```

**Recomendación para MVP:** Solución A (más simple, integrada con Sequelize).

---

### 7️⃣ Managers: NO Deben Consultar BD

**INCORRECTO:**
```typescript
// ❌ Manager consultando BD
static async playCard(cardId, playerNumber) {
  const card = await Card.findByPk(cardId); // ❌ NO AQUÍ
  // ...
}
```

**CORRECTO:**
```typescript
// ✅ Recibe objetos como parámetros
static async playCard(cardInPlay, playerNumber) {
  // cardInPlay ya viene del Coordinator
  // No consultamos BD aquí
}
```

**Por qué:** Mantiene pureza de capa y permite testear sin BD.

---

## 🧠 GameRulesEngine Concreto: TurnRulesEngine

Este es el motor puro más importante. **NO toca BD, NO tiene transacciones, NO await**.

### Estructura Base

```typescript
// src/engine/TurnRulesEngine.ts

import { GameState } from '../models/GameState';
import { BASE_MATCH_RULES } from '../config/base.rules';

export class TurnRulesEngine {
  /**
   * Valida si un jugador puede terminar su turno
   * 
   * ✅ Puro - Sin BD
   * ✅ Síncrono - Sin await
   * ✅ Determinístico - Misma entrada = mismo resultado
   */
  static validateEndTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    // Regla 1: ¿Es su turno?
    if (state.current_player !== playerNumber) {
      return { 
        valid: false, 
        error: `No es turno de jugador ${playerNumber}. Turno actual: ${state.current_player}` 
      };
    }

    // Regla 2: ¿Fase válida?
    const validPhases = ['player1_turn', 'player2_turn'];
    if (!validPhases.includes(state.phase)) {
      return { 
        valid: false, 
        error: `Fase inválida: ${state.phase}` 
      };
    }

    // Todos los checks pasaron
    return { valid: true };
  }

  /**
   * Ejecuta fin de turno
   * 
   * Mutaciones:
   * 1. Cambiar jugador actual
   * 2. Cambiar fase
   * 3. Incrementar turno (solo si vuelve al jugador 1)
   * 4. Otorgar cosmos al siguiente jugador
   * 5. (Futuro: resetear flags, robar carta, etc.)
   */
  static endTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { newState: GameState; error?: string } {
    // 🔒 INMUTABILIDAD CRÍTICA: Clonar estado
    // Nunca mutamos el estado original
    const newState = structuredClone(state);

    // Calcular próximo jugador
    const nextPlayer = playerNumber === 1 ? 2 : 1;

    // 1️⃣ Cambiar jugador
    newState.current_player = nextPlayer;

    // 2️⃣ Cambiar fase (nombre depende de BASE_MATCH_RULES)
    newState.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';

    // 3️⃣ Incrementar número de turno (solo cuando vuelve al jugador 1)
    if (nextPlayer === 1) {
      newState.current_turn += 1;
    }

    // 4️⃣ Otorgar cosmos al siguiente jugador
    // ⚠️ AQUÍ USAMOS BASE_MATCH_RULES (centralizado)
    const cosmosIncrease = BASE_MATCH_RULES.turn.cosmos_per_turn || 3;
    newState.players[nextPlayer].cosmos += cosmosIncrease;

    // 5️⃣ (Futuro) Resetear flags de ataque
    // if (newState.cardInPlay) {
    //   newState.cardInPlay.forEach(card => {
    //     if (card.player_number === nextPlayer) {
    //       card.attacked_this_turn = false;
    //     }
    //   });
    // }

    // 6️⃣ (Futuro) Robar carta
    // if (newState.playerDecks[nextPlayer].length > 0) {
    //   const drawnCard = newState.playerDecks[nextPlayer].pop();
    //   newState.playerHands[nextPlayer].push(drawnCard);
    // }

    return { newState };
  }
}
```

### Cómo TurnManager usa TurnRulesEngine

```typescript
// src/services/game/turnManager.ts

import { TurnRulesEngine } from '../../engine/TurnRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';  // ← mappers/, NO engine/
import { GameStateBuilder } from './GameStateBuilder';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';

export class TurnManager {
  /**
   * Finaliza turno del jugador
   * 
   * ORDEN CRÍTICO:
   * 0. IDEMPOTENCIA CHECK (fuera transacción - rápido)
   * 1. ✅ Locking (previene race conditions)
   * 2. ✅ Mapear BD → Estado puro (MatchStateMapper)
   * 3. ✅ VALIDAR REGLAS (TurnRulesEngine - PURO)
   * 4. ✅ EJECUTAR REGLAS (TurnRulesEngine - PURO)
   * 5. ✅ Persistir cambios (MatchRepository)
   * 6. ✅ Registrar acción (ProcessedActionsRegistry - idempotencia REGISTRY)
   * 7. ✅ Serializar respuesta (GameStateBuilder)
   */
  static async endTurn(
    match: Match,
    playerNumber: 1 | 2,
    actionId: string
  ) {
    // 0️⃣ IDEMPOTENCIA CHECK (ANTES de transacción)
    // Si esta acción ya fue procesada, retorna resultado cached
    const existing = await ProcessedActionsRegistry.find(actionId);
    if (existing) {
      console.log(`[Idempotencia] Acción ${actionId} ya fue procesada`);
      return {
        success: true,
        matchState: existing.cached_result
      };
    }

    // ENTRA A TRANSACCIÓN
    return await sequelize.transaction(async (transaction) => {
      // 1️⃣ LOCKING: Recargar match con lock exclusivo
      await match.reload({ 
        lock: transaction.LOCK.UPDATE,
        transaction 
      });

      // 2️⃣ MAPEO: BD → Estado puro
      const currentState = MatchStateMapper.fromMatch(match);

      // 3️⃣ VALIDACIÓN: Usar TurnRulesEngine (PURO)
      const validation = TurnRulesEngine.validateEndTurn(
        currentState,
        playerNumber
      );
      if (!validation.valid) {
        throw new ValidationError(validation.error);
      }

      // 4️⃣ EJECUCIÓN: Usar TurnRulesEngine (PURO)
      const result = TurnRulesEngine.endTurn(currentState, playerNumber);

      // 5️⃣ PERSISTENCIA: Aplicar estado puro a modelo BD
      await MatchRepository.applyState(
        match,
        result.newState,
        transaction
      );

      // 6️⃣ IDEMPOTENCIA REGISTRY: Guardar acción como procesada
      await ProcessedActionsRegistry.register(
        actionId,
        match.id,
        playerNumber,
        result.newState,
        transaction
      );

      // 7️⃣ SERIALIZACIÓN: Construir respuesta
      const matchState = GameStateBuilder.buildFromState(result.newState);

      return { success: true, matchState };
    });
  }
}
```

### Beneficio Enorme

Con esto ya separado, ahora puedes:

**Sin tocar BD, sin servidor corriendo:**

```typescript
// Validar una jugada sin BD
const state = {
  current_player: 1,
  phase: 'player1_turn',
  players: { 1: { cosmos: 5 }, 2: { cosmos: 10 } },
  current_turn: 3
};

const valid = TurnRulesEngine.validateEndTurn(state, 1);
console.log(valid); // { valid: true }

// Ejecutar turno
const result = TurnRulesEngine.endTurn(state, 1);
console.log(result.newState.current_player); // 2
console.log(result.newState.current_turn); // 4
console.log(result.newState.players[2].cosmos); // 13 (10 + 3)
```

Ahora imagina que quieres **IA que simule 10 turnos posibles**:

```typescript
// Simular árbol de decisiones SIN base de datos
function evaluateGameTree(state: GameState, depth: number): number {
  if (depth === 0) return evaluatePosition(state);
  
  let bestScore = -Infinity;
  
  // Simular: fin de turno
  const nextState1 = TurnRulesEngine.endTurn(state, state.current_player).newState;
  const score1 = evaluateGameTree(nextState1, depth - 1);
  
  // Simular: jugar carta X
  const nextState2 = CardRulesEngine.playCard(state, cardX).newState;
  const score2 = evaluateGameTree(nextState2, depth - 1);
  
  // Simular: atacar con Y
  const nextState3 = AttackRulesEngine.attack(state, attackerY, defenderZ).newState;
  const score3 = evaluateGameTree(nextState3, depth - 1);
  
  return Math.max(score1, score2, score3);
}
```

Eso es oro puro. IA offline, sin BD, puro cálculo.

---

**Responsabilidad:** Obtener + Delegar (SIN validaciones)

```typescript
export class MatchesCoordinator {
  /**
   * Busca rival o crea nueva partida en espera
   * DELEGA: Todas las validaciones a StartMatchService
   */
  static async findMatch(userId: string) {
    return await StartMatchService.findMatch(userId);
  }

  /**
   * Crea match de prueba/test
   */
  static async startTestMatch(userId: string) {
    return await StartMatchService.createTestMatch(userId);
  }

  /**
   * Usuario abandona match
   */
  static async abandonMatch(matchId: string, userId: string) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };
    
    return await MatchService.abandonMatch(match, userId);
  }

  /**
   * Obtiene estado actual de match
   * DELEGA: Serialización a GameStateBuilder
   */
  static async getMatchState(matchId: string) {
    const match = await Match.findByPk(matchId);
    if (!match) return null;
    
    return await GameStateBuilder.buildFromMatch(match);
  }
}
```

**Principio:** NO valida, NO ejecuta lógica, SOLO OBTIENE y DELEGA.

---

## 🎮 MatchCoordinator (Operaciones por Match)

**Responsabilidad:** Obtener Match + Delegar a Manager correcto

```typescript
export class MatchCoordinator {
  /**
   * Fin de turno
   * DELEGA: Lógica de turno a TurnManager
   */
  static async endTurn(matchId: string, userId: string, actionId: string) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };
    
    const playerNumber = this.getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador' };
    
    return await TurnManager.endTurn(match, playerNumber, actionId);
  }

  /**
   * Juega una carta
   * DELEGA: Lógica de cartas a CardManager
   */
  static async playCard(
    matchId: string,
    userId: string,
    cardId: string,
    zone: string,
    position: number
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };
    
    const playerNumber = this.getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador' };
    
    return await CardManager.playCard(match, playerNumber, cardId, zone, position);
  }

  /**
   * Ataca
   * DELEGA: Lógica de combate a AttackManager
   */
  static async attack(
    matchId: string,
    userId: string,
    attackerId: string,
    defenderId: string
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };
    
    const playerNumber = this.getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador' };
    
    return await AttackManager.performAttack(match, playerNumber, attackerId, defenderId);
  }

  /**
   * Cambia modo defensivo
   * DELEGA: Cambio de modo a CardManager
   */
  static async changeDefensiveMode(
    matchId: string,
    userId: string,
    cardId: string,
    mode: 'normal' | 'defense' | 'evasion'
  ) {
    const match = await Match.findByPk(matchId);
    if (!match) return { success: false, error: 'Match no encontrado' };
    
    const playerNumber = this.getPlayerNumber(match, userId);
    if (!playerNumber) return { success: false, error: 'No eres jugador' };
    
    return await CardManager.changeDefensiveMode(match, playerNumber, cardId, mode);
  }

  /**
   * HELPER: obtiene número de jugador
   * (búsqueda simple, NO es validación)
   */
  private static getPlayerNumber(match: Match, userId: string): 1 | 2 | null {
    if (match.player1_id === userId) return 1;
    if (match.player2_id === userId) return 2;
    return null;
  }
}
```

**Principio:** Obtiene Match UNA SOLA VEZ, extrae playerNumber, y delega todo.

---

## 🔄 CPSD + Managers

### Cómo funciona CPSD (Client Proposes, Server Decides)

```
FASE 1: CLIENTE PROPONE
└─ WebSocket.endTurn(actionId)

         ↓ MatchCoordinator.endTurn()

FASE 2: COORDINADOR VALIDA CONTEXTO
├─ ¿Match existe?
├─ ¿Eres jugador?
├─ ¿Match activo?
└─ Delega a Manager

         ↓ TurnManager.endTurn()

⚠️ IDEMPOTENCIA CHECK (ANTES de transacción)
├─ ProcessedActionsRegistry.find(actionId)
└─ Si existe → Retorna cached result inmediatamente

         ↓ Si nuevo → ENTRA a transacción

FASE 3: GAMERULESENGINE VALIDA + EJECUTA (PURO)
├─ ✅ Validar reglas (TurnRulesEngine.validateEndTurn)
├─ ⚙️ Ejecutar reglas (TurnRulesEngine.endTurn)
└─ 📤 Retorna newState (inmutable)

         ↓ Si válido

FASE 4: TURNMANAGER PERSISTE (en BD, con transacción)
├─ 💾 Aplicar cambios (MatchRepository)
├─ 📝 Registrar acción (ProcessedActionsRegistry)
└─ 🔄 Serializar respuesta (GameStateBuilder)

         ↓ Transacción exitosa

RETORNO: Cliente recibe confirmación
└─ { success: true, matchState: {...} }
```

### Responsabilidades de Cada Capa

| Capa | Component | Valida | Ejecuta | Retorna |
|------|-----------|--------|---------|---------|
| **Coordinator** | MatchCoordinator | Contexto solo | Obtiene Match | match object |
| **RulesEngine** | TurnRulesEngine | Reglas (puro) | Muta estado | newState ✓ |
| **Manager** | TurnManager | Transacción | Persiste | success ✓ |
| **Repository** | MatchRepository | N/A | Actualiza BD | DB update |
| **Builder** | GameStateBuilder | N/A | Serializa | matchState |

**Clave:** TurnRulesEngine es PURO. No sabe BD. No hace await.

## 📁 Estructura de Carpetas Nueva

```
src/
├─ engine/                          ⭐ NUEVA: Motor de reglas puro
│  ├─ TurnRulesEngine.ts            (Validar + Ejecutar turnos - PURO)
│  ├─ CardRulesEngine.ts            (Validar + Ejecutar cartas - PURO)
│  ├─ AttackRulesEngine.ts          (Validar + Ejecutar combate - PURO)
│  ├─ GameState.ts                  (Modelo de estado puro)
│  └─ index.ts
│
├─ services/
│  ├─ coordinators/                 ⭐ COORDINADORES (Context validation)
│  │  ├─ matchesCoordinator.ts      (operaciones generales)
│  │  ├─ matchCoordinator.ts        (operaciones por match)
│  │  └─ index.ts
│  │
│  ├─ mappers/                       ⭐ MAPEADORES (BD → Estado puro)
│  │  ├─ MatchStateMapper.ts        (Match ↔ GameState - toca BD)
│  │  └─ index.ts
│  │
│  ├─ game/
│  │  ├─ turnManager.ts             (mejorado: con transacciones + idempotencia)
│  │  ├─ cardManager.ts             (nuevo)
│  │  ├─ attackManager.ts           (existente, mejorado)
│  │  ├─ GameStateBuilder.ts        (existente)
│  │  └─ index.ts
│  │
│  ├─ repositories/                 ⭐ PERSISTENCIA (Toca BD)
│  │  ├─ MatchRepository.ts         (Operaciones BD especializadas)
│  │  └─ index.ts
│  │
│  ├─ registries/                   ⭐ REGISTROS (Tabla especial)
│  │  ├─ ProcessedActionsRegistry.ts (Tabla + idempotencia CHECK)
│  │  └─ index.ts
│  │
│  ├─ startMatch.service.ts         (refactorizado)
│  ├─ websocket.service.ts          (SIMPLIFICADO: solo handlers)
│  └─ gameLogic.service.ts          ❌ ELIMINAR (ya no necesario)
│
└─ config/
   └─ base.rules.ts                 (BASE_MATCH_RULES centralizado)
```

**Separación clara de intereses:**

| Carpeta | Conoce | No Conoce | Toca BD |
|---------|--------|-----------|----------:|
| `engine/` | GameState, BaseRules | Sequelize, Modelos | ❌ No |
| `services/mappers/` | Modelos, GameState | Business Logic | ✅ Sí (READ) |
| `services/game/` | Todo | - | ✅ Sí (WRITE) |
| `services/repositories/` | Modelos | Business Logic | ✅ Sí (WRITE) |
| `services/coordinators/` | Modelos | Business Logic | ✅ Sí (READ) |

**Regla de oro:**
- `engine/` es 100% puro - NO importa nada relacionado a BD
- `services/mappers/` es el puente BD → puro
- Managers y Repositories usan ambos

---

## 🔗 Integración con TURN-SYSTEM-DESIGN.md

### Documento Existente (TURN-SYSTEM-DESIGN.md)

Ya define:

```
Fase 1: Jugador Iniciador (GameMatch UI)
├─ Validaciones locales
└─ Envía action_id (UUID)

Fase 2: WebSocket (MatchSessionService)
└─ Envía evento al servidor

Fase 3: Procesamiento en Servidor
├─ Validaciones rigurosas
└─ Retorna estado
```

### Cómo se mapea con nueva arquitectura

```
Fase 1: Cliente propone
└─ GDScript envía { event: "end_turn", data: { match_id, action_id } }

         ↓ websocket.service.ts recibe mensaje

Fase 2: WebSocket delega
└─ MatchCoordinator.endTurn(matchId, userId, actionId)

         ↓ MatchCoordinator obtiene Match y delega

Fase 3: TurnManager valida + ejecuta
├─ validateTurn() [CPSD Phase 2]
├─ endTurn() [CPSD Phase 3]
└─ Retorna { success, matchState }

         ↓ websocket.service.ts envía evento

Retorno: Cliente recibe confirmación
└─ sendEvent(ws, 'turn_changed', matchState)
```

---

## 🎯 Flujo Completo: Fin de Turno

### WebSocket Handler (websocket.service.ts)

```typescript
case 'end_turn':
  try {
    const result = await MatchCoordinator.endTurn(
      data.match_id,
      ws.userId,
      data.action_id
    );
    
    if (!result.success) {
      sendEvent(ws, 'error', { code: 'END_TURN_FAILED', message: result.error });
      return;
    }
    
    // Enviar a ambos jugadores
    sendEvent(ws, 'turn_changed', result.matchState);
    broadcastToOpponent(ws, 'turn_changed', result.matchState);
    
  } catch (error) {
    console.error('Error en end_turn:', error);
    sendEvent(ws, 'error', { message: 'Error procesando fin de turno' });
  }
  break;
```

### MatchCoordinator

```typescript
static async endTurn(matchId: string, userId: string, actionId: string) {
  const match = await Match.findByPk(matchId);
  if (!match) return { success: false, error: 'Match no encontrado' };
  
  const playerNumber = this.getPlayerNumber(match, userId);
  if (!playerNumber) return { success: false, error: 'No eres jugador' };
  
  return await TurnManager.endTurn(match, playerNumber, actionId);
}
```

### TurnManager

```typescript
static async endTurn(match: Match, playerNumber: 1 | 2, actionId: string) {
  // 1. VALIDAR
  const validation = await this.validateTurn(match, playerNumber, actionId);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // 2. EJECUTAR
  const nextPlayer = match.current_player === 1 ? 2 : 1;
  match.current_player = nextPlayer;
  match.current_turn = nextPlayer === 1 ? match.current_turn + 1 : match.current_turn;
  match.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';

  await match.save();

  // 3. INICIAR SIGUIENTE TURNO
  await this.startTurn(match.id, nextPlayer);

  // 4. SERIALIZAR ESTADO
  const matchState = await GameStateBuilder.buildFromMatch(match);

  return { success: true, matchState };
}
```

---

## 📊 Ventajas de la Nueva Arquitectura

| Aspecto | Antes | Después |
|--------|-------|---------|
| **Líneas de lógica** | 2138 en websocket.service | ~200 por coordinator |
| **Búsquedas BD** | Duplicadas | 1 sola vez |
| **Responsabilidades** | Mezcladas | Claras |
| **Testabilidad** | Difícil | Fácil (servicios independientes) |
| **Mantenimiento** | Complicado | Simple |
| **Hardcodeo** | cosmos=10 | BASE_MATCH_RULES |
| **Escalabilidad** | Limitada | Expandible |

---

## 🔑 Principios Clave

### 1. Coordinators = Orquestadores Puros
- ✅ Obtienen datos
- ✅ Validan autorización BÁSICA (¿eres jugador?)
- ✅ Delegan TODO lo demás
- ❌ NO hacen lógica compleja
- ❌ NO validan reglas de juego

### 2. Managers = Lógica Especializada
- ✅ Validan reglas (¿es tu turno?, ¿cosmos suficiente?, etc)
- ✅ Ejecutan acciones
- ✅ Retornan estado actualizado
- ❌ NO buscan en BD (reciben objetos)

### 3. Una Sola Búsqueda por Acción
- ✅ Coordinator busca Match
- ✅ Coordinator obtiene playerNumber
- ✅ Coordinator delega Match + playerNumber
- ❌ Manager NO busca de nuevo

### 4. Configuración Centralizada
- ✅ BASE_MATCH_RULES define: cosmos_per_turn, initial_life, etc
- ✅ Managers usan BASE_MATCH_RULES
- ❌ NO hardcodeo en servicios

---

## 📝 Casos de Uso Ejemplo

### Caso 1: Fin de Turno

```
WebSocket recibe: { event: "end_turn", data: { match_id, action_id } }

1. MatchCoordinator.endTurn(match_id, userId, action_id)
   ├─ Obtiene Match (1 búsqueda)
   ├─ Extrae playerNumber
   └─ Delega

2. TurnManager.endTurn(match, playerNumber, action_id)
   ├─ validateTurn() → ¿es turno válido?
   ├─ Cambia match.current_player
   ├─ TurnManager.startTurn()
   │  ├─ giveCosmos() ← usa BASE_MATCH_RULES
   │  ├─ resetAttackFlags()
   │  └─ drawCard()
   └─ Retorna { success, matchState }

3. GameStateBuilder.buildFromMatch(match)
   └─ Serializa estado completo

4. WebSocket envía a ambos jugadores
```

### Caso 2: Jugar Carta

```
WebSocket recibe: { event: "play_card", data: { match_id, card_id, zone, position } }

1. MatchCoordinator.playCard(match_id, userId, card_id, zone, position)
   ├─ Obtiene Match
   ├─ Extrae playerNumber
   └─ Delega

2. CardManager.playCard(match, playerNumber, card_id, zone, position)
   ├─ Valida cosmos suficiente
   ├─ Valida carta en mano
   ├─ Actualiza CardInPlay
   ├─ Consume cosmos de Match
   └─ Retorna { success, cardInPlay? }

3. WebSocket envía confirmación
```

---

## 🚀 Pasos de Implementación

## 🚀 Pasos de Implementación

### Fase 1: Crear Arquitectura Base (Coordinators)
- [ ] Crear carpeta `src/services/coordinators/`
- [ ] Crear `MatchesCoordinator.ts` (context validation only)
- [ ] Crear `MatchCoordinator.ts` (context validation only)
- [ ] Integrar con websocket.service.ts

**Estimación:** 2-3 horas
**Dependencias:** Ninguna

---

### Fase 2: Crear GameRulesEngine (CRÍTICO - Motor Puro)
- [ ] Crear carpeta `src/engine/`
- [ ] Crear `GameState.ts` (modelo de estado puro)
- [ ] Crear `TurnRulesEngine.ts` (validate + execute - puro, determinístico)
- [ ] Crear `MatchStateMapper.ts` (Match ↔ GameState conversion)
- [ ] **Testing:** Validar sin BD (tests puros, sin Sequelize)

**Ejemplo de Test:**
```typescript
// ✅ Test de TurnRulesEngine (SIN BD, SIN servidor)
import { TurnRulesEngine } from './TurnRulesEngine';

test('endTurn aumenta cosmos del siguiente jugador', () => {
  const state = { current_player: 1, players: { 1: { cosmos: 5 }, 2: { cosmos: 10 } } };
  const result = TurnRulesEngine.endTurn(state, 1);
  
  expect(result.newState.current_player).toBe(2);
  expect(result.newState.players[2].cosmos).toBe(13); // 10 + 3 (cosmos_per_turn)
});
```

**Estimación:** 3-4 horas
**Dependencias:** BASE_MATCH_RULES

---

### Fase 3: Integrar GameRulesEngine en TurnManager
- [ ] Crear `MatchRepository.ts` (abstracción de persistencia)
- [ ] Crear `ProcessedActionsRegistry.ts` (tabla + idempotencia)
- [ ] Crear tabla SQL `processed_actions`
- [ ] Refactorizar `TurnManager.endTurn()` para:
  - Usar GameRulesEngine.validateEndTurn + endTurn
  - Agregar transacción `sequelize.transaction()`
  - Agregar locking (`lock: t.LOCK.UPDATE`)
  - Agregar ProcessedActionsRegistry

**Ejemplo:**
```typescript
static async endTurn(match, playerNumber, actionId) {
  return sequelize.transaction(async (t) => {
    // 1. Lock
    await match.reload({ lock: t.LOCK.UPDATE, transaction: t });
    
    // 2. Mapear
    const state = MatchStateMapper.fromMatch(match);
    
    // 3. Validar (GameRulesEngine)
    const valid = TurnRulesEngine.validateEndTurn(state, playerNumber);
    if (!valid.valid) throw new Error(valid.error);
    
    // 4. Ejecutar (GameRulesEngine)
    const result = TurnRulesEngine.endTurn(state, playerNumber);
    
    // 5. Persistir
    await MatchRepository.applyState(match, result.newState, t);
    
    // 6. Idempotencia
    await ProcessedActionsRegistry.register(actionId, match.id, playerNumber, t);
    
    return { success: true, matchState: GameStateBuilder.buildFromState(result.newState) };
  });
}
```

**Estimación:** 3-4 horas
**Dependencias:** Fase 2

---

### Fase 4: Crear CardRulesEngine + AttackRulesEngine
- [ ] Crear `CardRulesEngine.ts` (puro, determinístico)
- [ ] Crear `AttackRulesEngine.ts` (puro, determinístico)
- [ ] Integrar en `CardManager.ts` con transacciones
- [ ] Integrar en `AttackManager.ts` con transacciones

**Estimación:** 4-5 horas
**Dependencias:** Fase 2

---

### Fase 5: Simplificar WebSocket
- [ ] Reemplazar handlers con coordinators
- [ ] Eliminar lógica duplicada
- [ ] Validar que websocket.service.ts quede con ~300-500 líneas (de 2138)

**Estimación:** 2-3 horas
**Dependencias:** Fase 1, 3, 4

---

### Fase 6: Agregar Locking Completo (Opcional para MVP)
- [ ] Implementar MySQL `LOCK.UPDATE` en todos los Managers
- [ ] O alternative: Redis locks (más complejo)
- [ ] Testear race conditions

**Estimación:** 2-3 horas (opcional)
**Dependencias:** Fase 3, 4

---

### Fase 7: Testing y Validación
- [ ] ✅ Tests unitarios de GameRulesEngine (sin BD)
- [ ] ✅ Tests unitarios de Coordinators
- [ ] ✅ Tests de integración: Coordinator → Manager → RulesEngine
- [ ] ✅ Tests de idempotencia (reintentos)
- [ ] ✅ Tests de concurrencia (race conditions)

**Estimación:** 4-6 horas
**Dependencias:** Todas

---

## 📊 Línea de Tiempo Estimada

| Fase | Horas | Acumulado |
|------|-------|-----------|
| Fase 1 (Coordinators) | 3 | 3 horas |
| **Fase 2 (GameRulesEngine)** | 4 | **7 horas** ⭐ |
| Fase 3 (TurnManager + Transacciones) | 4 | 11 horas |
| Fase 4 (Card + Attack Engines) | 5 | 16 horas |
| Fase 5 (Simplificar WebSocket) | 3 | 19 horas |
| Fase 6 (Locking) | 2 | 21 horas (opcional) |
| Fase 7 (Testing) | 5 | **26 horas** |

**MVP Mínimo:** Fases 1-5 = ~19 horas
**Production-Grade:** Fases 1-7 = ~26 horas

---

## 📌 Checklists de Validación

### ✅ Arquitectura Cumple

- [x] 7 capas claramente separadas (WebSocket → Coordinator → RulesEngine → Manager → Repository → Models)
- [x] Responsabilidades únicas por capa
- [x] **Validaciones contextuales** (Coordinator) vs **Reglas de Juego** (RulesEngine)
- [x] **GameRulesEngine puro** - determinístico, sin BD, testeable offline
- [x] **Transacciones atómicas** - TODO o NADA por acción
- [x] **Idempotencia persistida** - ProcessedActions registry
- [x] **Locking por match** - preparado (MySQL o Redis)
- [x] **Managers puros** - NO queries, reciben objetos

### ⚠️ TODO: Antes de Producción

**Crítico (MVP++):**
- [ ] Implementar GameRulesEngine (sin BD)
- [ ] Implementar transacciones en TurnManager
- [ ] Crear tabla ProcessedActions
- [ ] Validar idempotencia completa

**Importante (Pre-Release):**
- [ ] Implementar locking por match
- [ ] Testing completo de race conditions
- [ ] Performance testing con concurrencia

**Nice-To-Have (Post-Release):**
- [ ] Replay/Simulation de partidas
- [ ] AI Planning (usa GameRulesEngine)
- [ ] Match validation offline

---

## 📚 Documentación Relacionada

- [TURN-SYSTEM-DESIGN.md](./TURN-SYSTEM-DESIGN.md) - CPSD + Diseño de turnos
- [BASE-MATCH-RULES](../src/game/rules/base.rules.ts) - Configuración central
- Sequelize Transactions: https://sequelize.org/docs/v6/other-topics/transactions/
- MySQL Row Locking: https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html

---

## 🎯 Resumen Ejecutivo Final

This architecture maps to a **professional game server** pattern:

```
Tier 1: API Layer (WebSocket)
        ↓
Tier 2: Orchestration (Coordinators - context validation only)
        ↓
Tier 3: Business Rules (GameRulesEngine - pure deterministic logic)
        ↓
Tier 4: Persistence Layer (Managers + Repository - atomic transactions)
        ↓
Tier 5: Database (Models + Sequelize)
```

**Key achievements:**
- ✅ Idempotent (ProcessedActions)
- ✅ Atomic (sequelize transactions)
- ✅ Deterministic (GameRulesEngine pure)
- ✅ Concurrent-safe (locking)
- ✅ Testeable (no coupled to DB)
- ✅ Scalable (clear separation)
- ✅ Maintainable (single responsibility)

---

**Última actualización:** 23 Febrero 2026 | **Status:** ✅ Production-Grade Architecture | **Ready for Implementation**
