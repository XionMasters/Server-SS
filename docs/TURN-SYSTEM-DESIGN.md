# Sistema de Turnos - Especificación Completa

## Resumen Ejecutivo

El sistema de turnos sigue el principio **Client Proposes, Server Decides (CPSD)**. El cliente no nunca cambia el turno localmente; siempre espera confirmación del servidor.

---

## Flujo Completo de Cambio de Turno

### 1️⃣ Fase: Jugador Iniciador (GameMatch UI)

**Precondición:** Está en un match activo y es su turno

**Acciones:**
```gdscript
func _on_end_turn_button_pressed():
    # Validaciones locales (UI layer)
    if not can_end_turn():
        return
    
    # Verificaciones
    if not is_player_turn():
        print("❌ No es tu turno")
        return
    
    if is_animating():
        print("❌ Animación en curso")
        return
    
    # El cliente propone
    MatchSessionService.end_turn()
```

**Validaciones Locales:**
- ✅ `is_player_turn()` - Verificar GameState.current_turn_player_id == player_number
- ✅ `is_animating()` - Verificar que no hay animaciones críticas (cartas jugadas, ataques)
- ⚠️ `has_mandatory_actions()` - FUTURO: acciones obligatorias por reglas

**Retroalimentación Visual (mientras espera):**
```gdscript
# El botón se deshabilita
end_turn_button.disabled = true
end_turn_button.text = "Enviando..."

# Opcional: mostrar spinner/animación de espera
```

---

### 2️⃣ Fase: Envío a Servidor (MatchSessionService)

**Responsabilidades:**

```gdscript
func end_turn():
    # Verificación de precondiciones
    if not is_in_match:
        print("❌ No estás en una partida")
        return
    
    if not is_my_turn():
        print("❌ No es tu turno (según el estado sincronizado)")
        return
    
    # El servidor es la autoridad final
    # No modificamos el estado local aquí
    
    # Construir payload CON action_id para idempotencia
    var action_id = generate_uuid()  # 👈 CRÍTICO: ID único por acción
    
    var payload = {
        "event": "end_turn",
        "data": {
            "match_id": current_match.id,
            "action_id": action_id,           # 👈 Prevenir duplicados
            "turn_number": game_state.turn_number,  # Para debugging
            "timestamp": int(Time.get_ticks_msec())  # SOLO para logging
        }
    }
    
    # IMPORTANTE: No modificar game_state ni emitir signals
    # Esperamos respuesta del servidor via match_updated
    WebSocketManager.send_json(payload)
```

**Restricciones Importantes:**
- ❌ NO modificar `GameState` aquí
- ❌ NO emitir `turn_changed` aquí
- ❌ NO cambiar estado de cartas (exhausted, etc.)
- ✅ Solo enviar el evento al servidor
- ✅ SIEMPRE incluir `action_id` único (UUID)

**Timeout Handling:**
```gdscript
var turn_end_timeout = 10.0  # segundos

func _check_turn_end_timeout():
    if Time.get_ticks_msec() - turn_end_send_time > turn_end_timeout * 1000:
        print("⚠️ Timeout esperando respuesta del servidor")
        end_turn_button.disabled = false
        end_turn_button.text = "Finalizar turno" # O mismo texto inicial
        # No rollback de estado (no modificamos localmente)
```

---

### 3️⃣ Fase: Procesamiento en Servidor

**Endpoint:** `websocket-integrations.ts` → `handleEndTurnRefactored()` (evento `end_turn`)

**Validaciones del Servidor (CRÍTICAS):**

⚠️ **IMPORTANTE:** Nunca confíes en el cliente. Valida TODO como si fuera un atacante.

La arquitectura actual delega las validaciones a componentes especializados:

```typescript
// websocket-integrations.ts
export async function handleEndTurnRefactored(
  ws: AuthenticatedWebSocket,
  data: {
    match_id: string;
    action_id?: string;  // UUID para idempotencia
  }
) {
  try {
    console.log(`⭐️ ${ws.username} termina turno (REFACTORED)`);

    const { match_id, action_id = uuidv4() } = data;
    const userId = ws.userId!;

    // ========================================================================
    // FASE 2: VALIDACIÓN DE CONTEXTO (CPSD)
    // ========================================================================
    const match = await Match.findByPk(match_id);
    if (!match) {
      sendEvent(ws, 'error', { message: 'Partida no encontrada', code: 'MATCH_NOT_FOUND' });
      return;
    }

    // 🔒 Verificación: ¿El usuario es jugador en este match?
    const playerNumber =
      match.player1_id === userId ? 1 : match.player2_id === userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', { message: 'No perteneces a este match', code: 'NOT_IN_MATCH' });
      return;
    }

    // ========================================================================
    // FASE 3: EJECUCIÓN CON IDEMPOTENCIA + TRANSACCIÓN (delegar a TurnManager)
    // ========================================================================
    const result = await TurnManager.endTurn(match, playerNumber, action_id);

    if (!result.success) {
      sendEvent(ws, 'error', { 
        message: result.error || 'Error al terminar turno', 
        code: 'END_TURN_FAILED' 
      });
      return;
    }

    // ========================================================================
    // FASE 4: NOTIFICACIÓN A CLIENTES (⚠️ TODO: implementar broadcast)
    // ========================================================================
    sendEvent(ws, 'turn_ended', {
      success: true,
      action_id,
      is_retry: result.isRetry,
      message: result.isRetry ? 'Reintento exitoso' : 'Turno terminado',
    });
    
    // TODO: Enviar match_updated a ambos jugadores vía WebSocketManager
    // const broadcastData = {
    //   match_id,
    //   new_state: result.newState,
    //   is_retry: result.isRetry
    // };
    // await WebSocketManager.broadcast(match_id, 'match_updated', broadcastData);

  } catch (error) {
    console.error('❌ Error en handleEndTurnRefactored:', error);
    sendEvent(ws, 'error', {
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}
```
```

**Orden de Operaciones (CRÍTICO - NO REORDENAR):**

El flujo detallado está implementado en `TurnRulesEngine.endTurn()`:

```
┌─ FIN DE TURNO DEL JUGADOR ACTUAL ──────────────────────┐
│                                                          │
│  1. Validar precondiciones (TurnRulesEngine.validateEndTurn)
│     - Match existe y está en estado válido              │
│     - Usuario es jugador en el match                    │
│     - Es realmente su turno                             │
│                                                          │
│  2. Mapear estado (MatchStateMapper.fromMatch)          │
│     - Convertir Match DB → GameState puro               │
│                                                          │
│  3. Ejecutar efectos END_OF_TURN del jugador actual     │
│     (ejemplo: venenos, maldiciones que se aplican)     │
│                                                          │
│  4. Resetear estados de cartas del jugador actual       │
│     (is_exhausted = false)                             │
│                                                          │
│  5. Verificar win condition                            │
│     (¿Ganó alguien? Si sí, terminar partida)          │
│                                                          │
│  6. Cambiar currentPlayerId (1 → 2 o 2 → 1)            │
│     Incrementar turnNumber                              │
│                                                          │
└─ INICIO DE TURNO DEL NUEVO JUGADOR ──────────────────┘
│                                                          │
│  7. Incrementar Recursos del nuevo jugador              │
│     (+3 cosmos, resets a cap si es necesario)          │
│                                                          │
│  8. Robar Carta Automática para nuevo jugador           │
│     (si el deck tiene cartas disponibles)              │
│                                                          │
│  9. Ejecutar efectos START_OF_TURN del nuevo jugador    │
│     (bonificaciones, generadores, etc.)                │
│                                                          │
│  10. Aplicar cambios al Match DB (MatchRepository)      │
│      - Guardar con transacción + lock pessimista        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Implementación Actual (TurnManager):**

```typescript
// game/turnManager.ts
static async endTurn(
  match: any,
  playerNumber: 1 | 2,
  actionId: string
): Promise<{
  success: boolean;
  newState: GameState | null;
  error?: string;
  isRetry?: boolean;
}> {
  try {
    // ========================================================================
    // PASO 0️⃣: IDEMPOTENCIA CHECK (ANTES de transacción - CRÍTICO)
    // ========================================================================
    const cached = await ProcessedActionsRegistry.find(actionId);
    if (cached) {
      console.log(`[TurnManager] Acción ${actionId} ya procesada (retry), retornando resultado cached`);
      return {
        success: true,
        newState: cached.cached_result,
        isRetry: true,
      };
    }

    // ========================================================================
    // PASO 1: TRANSACCIÓN CON LOCK (pessimistic)
    // ========================================================================
    const result = await sequelize.transaction(
      async (transaction) => {
        // ====================================================================
        // PASO 2: LOCK DE FILA
        // ====================================================================
        await match.reload({
          lock: transaction.LOCK.UPDATE,
          transaction,
        });

        // ====================================================================
        // PASO 3: MAPEAR A ESTADO PURO
        // ====================================================================
        const currentState = MatchStateMapper.fromMatch(match);

        // ====================================================================
        // PASO 4: VALIDAR REGLAS
        // ====================================================================
        const validation = TurnRulesEngine.validateEndTurn(currentState, playerNumber);
        if (!validation.valid) {
          throw new Error(validation.error || 'Validación fallida');
        }

        // ====================================================================
        // PASO 5: EJECUTAR REGLAS (puro, sin mutación de DB)
        // ====================================================================
        const execution = TurnRulesEngine.endTurn(currentState, playerNumber);
        if (!execution.newState) {
          throw new Error('Error al ejecutar reglas de turno');
        }

        // ====================================================================
        // PASO 6: APLICAR CAMBIOS AL MODELO DE BD
        // ====================================================================
        await MatchRepository.applyState(match, execution.newState, transaction);

        // ====================================================================
        // PASO 7: REGISTRAR COMO PROCESADA (idempotencia)
        // ====================================================================
        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          execution.newState,
          'turn_end',  // actionType
          transaction
        );

        return execution.newState;
      }
    );

    return {
      success: true,
      newState: result,
    };
  } catch (error) {
    console.error('[TurnManager] Error en endTurn:', error);
    return {
      success: false,
      newState: null,
      error: error instanceof Error ? error.message : 'Error desconocido',
    };
  }
}
```

**Componentes Clave:**

1. **TurnRulesEngine**: Lógica pura de reglas de juego
   - `validateEndTurn(currentState, playerNumber)` - Valida precondiciones
   - `endTurn(currentState, playerNumber)` - Calcula nuevo estado (sin mutación)

2. **MatchStateMapper**: Convierte entre capas
   - `fromMatch(match)` - Match DB → GameState puro
   
3. **ProcessedActionsRegistry**: Control de idempotencia
   - `find(actionId)` - Busca acciones ya procesadas
   - `register(actionId, ...)` - Cachea resultado para reintentos
   
4. **MatchRepository**: Persistencia
   - `applyState(match, newState, transaction)` - Aplica cambios al modelo DB

---

### 4️⃣ Fase: Sincronización del Nuevo Turno (WebSocket Broadcast)

**⚠️ IMPORTANTE: Estado Actual de Implementación**

El `handleEndTurnRefactored` actualmente:
- ✅ Valida y procesa el end_turn
- ✅ Ejecuta TurnRulesEngine y persiste cambios
- ✅ Envía `turn_ended` al cliente que hizo la acción
- ❌ **TODO**: Enviar `match_updated` a **ambos** jugadores con el nuevo estado

**Flujo Esperado (cuando TODO esté implementado):**

```typescript
// websocket-integrations.ts - después de TurnManager.endTurn() exitoso

const result = await TurnManager.endTurn(match, playerNumber, action_id);

if (!result.success) {
  sendEvent(ws, 'error', { message: result.error, code: 'END_TURN_FAILED' });
  return;
}

// ✅ Confirmar al jugador que accionó
sendEvent(ws, 'turn_ended', {
  success: true,
  action_id,
  is_retry: result.isRetry,
});

// ⚠️ TODO: Broadcast del nuevo estado a AMBOS jugadores
// await WebSocketManager.broadcast(match_id, 'match_updated', {
//   turn_number: result.newState.turn_number,
//   current_player: result.newState.currentPlayerNumber,
//   player1_cosmos: result.newState.p1Cosmos,
//   player2_cosmos: result.newState.p2Cosmos,
//   cards_in_play: result.newState.cardsInPlay,
//   // ... resto del estado
// });
```

**¿Por qué snapshot completo?**

El servidor DEBE enviar estado versionado completo:
- `turn_number` + `action_sequence` - Detectar eventos fuera de orden
- Todas las cartas en juego - Reconciliación trivial
- Recursos actuales - Sin cálculos del cliente
- Validación de secuencia clara

**Payload de Respuesta (cuando esté implementado):**

```typescript
// Después de TurnManager.endTurn() exitoso:

const broadcastPayload = {
  match_id: match.id,
  turn_number: result.newState.turn_number,
  action_sequence: result.newState.action_sequence,
  current_player: result.newState.currentPlayerNumber,
  
  // Estados actualizados
  player1_cosmos: result.newState.p1Cosmos,
  player2_cosmos: result.newState.p2Cosmos,
  player1_hand_count: result.newState.p1HandCount,
  player2_hand_count: result.newState.p2HandCount,
  player1_deck_size: result.newState.p1DeckSize,
  player2_deck_size: result.newState.p2DeckSize,
  
  // Cartas en juego (incluyendo la robada)
  cards_in_play: result.newState.cardsInPlay,
  
  // Timestamp del servidor (para validación)
  server_timestamp: Date.now()
};

// Broadcast a ambos jugadores
await WebSocketManager.broadcast(match_id, 'match_updated', broadcastPayload);
```

**Flujo en Godot (WebSocketManager + MatchManager):**

```gdscript
# En WebSocketManager (recibe evento del servidor)
func _on_server_message(data: Dictionary):
    match data.event:
        "match_updated":
            # Procesar snapshot completo del servidor
            MatchManager._update_match_state(data.data)

# En MatchManager (orquestador del estado)
func _update_match_state(data: Dictionary):
    # El servidor nos envía SNAPSHOT COMPLETO
    
    # Detectar cambio de turno ANTES de actualizar
    var old_turn = _current_match_state.turn_number
    var old_player = _current_match_state.current_player
    
    # Validar secuencia ANTES de aplicar
    if not _is_valid_sequence(data):
        print("❌ Evento fuera de orden detectado, pidiendo resync")
        request_full_resync()
        return
    
    # Aplicar snapshot completo
    _current_match_state = GameState.from_server_data(data)
    
    # Emitir signals para que GameBoard reaccione
    if _current_match_state.turn_number > old_turn:
        # Turn cambió
        turn_changed.emit(_current_match_state.current_player)
    
    # Siempre emitir actualización general
    match_state_updated.emit(data)

func _is_valid_sequence(data: Dictionary) -> bool:
    # Verificar que eventos llegan en orden
    var last_turn = _current_match_state.turn_number
    var last_sequence = _current_match_state.action_sequence
    
    if data.turn_number < last_turn:
        return false  # Evento antiguo
    
    if data.turn_number == last_turn:
        if data.action_sequence <= last_sequence:
            return false  # Duplicado o retraso
    
    return true
```

**GameState tiene versionado:**

```gdscript
class_name GameState

var turn_number: int                   # Versión del turno
var current_player: int                # Jugador actual (1 o 2)
var action_sequence: int               # Secuencia de acciones
# ... resto del estado

static func from_server_data(data: Dictionary, local_player_id: String) -> GameState:
    # Factory method que crea GameState desde payload del servidor
    var state = GameState.new()
    state.turn_number = data.turn_number
    state.current_player = data.current_player
    state.action_sequence = data.action_sequence
    # ... mapear resto de propiedades
    return state
```

---

### 5️⃣ Fase: Reacción en UI (GameMatch)

**Cuando recibe `turn_changed`:**

```gdscript
func _on_turn_changed(new_player: int):
    # Reacción en base a quién es ahora el turno
    
    if new_player == player_number:
        # Es nuestro turno
        _on_our_turn_starts()
    else:
        # Es turno del oponente
        _on_opponent_turn_starts()

func _on_our_turn_starts():
    # ✅ Habilitar interacción
    enable_player_interaction()
    
    # 📝 Mostrar indicador
    turn_indicator.text = "Tu turno"
    turn_indicator.self_modulate = Color.GREEN
    
    # 🎬 Animación (opcional)
    var tween = create_tween()
    tween.tween_property(turn_banner, "modulate", Color.WHITE, 0.5)
    tween.tween_callback(func(): turn_banner.hide())
    
    # 🔘 Habilitar botón de pasar turno
    end_turn_button.disabled = false
    end_turn_button.text = "Pasar Turno"

func _on_opponent_turn_starts():
    # ❌ Bloquear interacción
    disable_player_interaction()
    
    # 📝 Mostrar indicador
    turn_indicator.text = "Turno del Oponente"
    turn_indicator.self_modulate = Color.RED
    
    # 🔘 Deshabilitar botón
    end_turn_button.disabled = true
    end_turn_button.text = "Esperando..."
```

---

## 🏗️ Arquitectura Actual Implementada

**Estado**: Refactorización en progreso (Diciembre 2025)

### Componentes Principales

La lógica de `end_turn` está distribuida en estos módulos:

```
websocket-integrations.ts
└── handleEndTurnRefactored(ws, data)
    │
    └─▶ TurnManager.endTurn(match, playerNumber, actionId)
        │
        ├─▶ ProcessedActionsRegistry.find(actionId)
        │   └─ Detecta reintentos (idempotencia)
        │
        ├─▶ sequelize.transaction()
        │   │
        │   ├─▶ match.reload({ lock: LOCK.UPDATE })
        │   │   └─ Pessimistic locking (evita race conditions)
        │   │
        │   ├─▶ MatchStateMapper.fromMatch(match)
        │   │   └─ Convierte Match DB → GameState puro
        │   │
        │   ├─▶ TurnRulesEngine.validateEndTurn(state, playerNumber)
        │   │   └─ Valida precondiciones (sin mutación)
        │   │
        │   ├─▶ TurnRulesEngine.endTurn(state, playerNumber)
        │   │   └─ Calcula nuevo estado (puro, sin mutación)
        │   │
        │   ├─▶ MatchRepository.applyState(match, newState)
        │   │   └─ Aplica cambios al modelo Match
        │   │
        │   └─▶ ProcessedActionsRegistry.register(actionId, ...)
        │       └─ Cachea resultado para próximos reintentos
        │
        └─▶ return { success, newState, isRetry }
```

### Responsabilidades por Archivo

| Componente | Archivo | Responsabilidad |
|-----------|---------|-----------------|
| **WebSocket Handler** | `websocket-integrations.ts` | Recibe evento, valida usuario, delega a TurnManager |
| **TurnManager** | `services/game/turnManager.ts` | Orquesta transacción atómica + idempotencia |
| **TurnRulesEngine** | `engine/TurnRulesEngine.ts` | Lógica pura: validar y ejecutar end_turn |
| **MatchStateMapper** | `services/mappers/MatchStateMapper.ts` | Convierte Match DB ↔ GameState (puro) |
| **ProcessedActionsRegistry** | `services/registries/ProcessedActionsRegistry.ts` | Cacheo de acciones procesadas |
| **MatchRepository** | `services/repositories/MatchRepository.ts` | CRUD de Match + persist cambios |

### Flujo de Idempotencia

```typescript
// PASO 0: Chequeo rápido (sin lock)
const cached = await ProcessedActionsRegistry.find(actionId);
if (cached) {
  // Si ya procesamos, devolver resultado cached sin hacer nada
  return { success: true, newState: cached, isRetry: true };
}

// PASO 1-7: Transacción (si acción es nueva)
const result = await sequelize.transaction(async (t) => {
  // 2. Lock pessimista (impide que otro proceso modifique)
  await match.reload({ lock: t.LOCK.UPDATE, transaction: t });
  
  // 3-5. Validar y ejecutar
  const validation = TurnRulesEngine.validateEndTurn(...);
  const execution = TurnRulesEngine.endTurn(...);
  
  // 6. Aplicar cambios
  await MatchRepository.applyState(match, execution.newState, t);
  
  // 7. Registrar como procesada (si falla aquí = rollback todo)
  await ProcessedActionsRegistry.register(actionId, ..., t);
  
  return execution.newState;
});
```

### TODO: Broadcast Pendiente

**Estado actual**: Después de TurnManager.endTurn(), el servidor:
- ✅ Confirma al cliente con `turn_ended`
- ❌ **FALTA**: Broadcast de `match_updated` a ambos jugadores

**Trabajo pendiente**:
```typescript
// Después de TurnManager.endTurn() exitoso:

// TODO: Implementar broadcast
const broadcastData = {
  match_id: match.id,
  turn_number: result.newState.turn_number,
  current_player: result.newState.currentPlayerNumber,
  // ... resto del estado
};

// Enviar a AMBOS jugadores
await WebSocketManager.broadcast(match_id, 'match_updated', broadcastData);
```

---

## Validaciones Clave

### Validaciones en Cliente (Seguridad UX)
| Validación | Dónde | Propósito |
|------------|-------|----------|
| `is_player_turn()` | GameMatch | Evitar clicks accidentales |
| `not is_animating()` | GameMatch | Evitar conflictos de animación |
| `is_in_match` | MatchManager (Godot) | Precondición básica |
| `is_my_turn()` | MatchManager (Godot) | Verificar antes de enviar |

### Validaciones en Servidor (Seguridad Real) 🔒

| Validación | Dónde | Propósito | Crítico |
|------------|-------|----------|---------|
| Match existe | handleEndTurnRefactored | Evitar inyecciones | ⚠️ |
| Usuario está en match (1 o 2) | handleEndTurnRefactored | **No truquear IDs** | 🔴 |
| Es realmente su turno | TurnRulesEngine.validateEndTurn | **No atacar otro turno** | 🔴 |
| Match está en fase válida | TurnRulesEngine.validateEndTurn | No end_turn en setup/finale | ⚠️ |
| Acción no duplicada (idempotencia) | ProcessedActionsRegistry | Rechazar reintentos | ⚠️ |

🔴 = **Crítica**: El servidor SIEMPRE debe validar, sin excepciones.  
⚠️ = **Importante**: Validar en contextos críticos cuando sea posible.

**NUNCA confíes en:**
- Timestamps del cliente ❌
- Validaciones del cliente ❌
- Datos opcionales del cliente ❌
- IDs o valores sin verificar ❌

---

## Edge Cases & Manejo de Errores

### Caso 1: Timeout del Servidor
```gdscript
# Cliente espera 10 segundos
# Si no responde:

# → El cliente NO cambia el turno localmente
# → Muestra "Reintentar"
# → Usuario puede cerrar el match

# NO hacer rollback del estado porque nunca lo modificamos
```

### Caso 2: Usuario envía END_TURN dos veces
```typescript
// Servidor rechaza el segundo:
if (match.current_player !== playerNumber) {
    // Rechazar silenciosamente o enviar error
    this.sendError(ws, "No es tu turno");
    return;
}
```

### Caso 3: Usuario desconecta durante su turno
```typescript
// Si tiene socket activo, detectar disconnect
// Guardar match como "waiting_for_player"
// Después de X minutos, dar win a oponente
```

### Caso 4: Deck vacío (no hay carta para robar)
```typescript
// El servidor intenta robar pero deck.length === 0
if (deck.length === 0) {
    console.log("Deck vacío - no se roba carta");
    // Algunas cartas de juego pueden causar daño aquí
    // Por ahora: simplemente no roba
}
```

---

## 🔄 Idempotencia: Protección Contra Reintentos

**⚠️ CRÍTICO: TODOS los eventos del cliente DEBEN llevar action_id**

No solo `end_turn`. También:
- `play_card`
- `attack`
- `activate_technique`
- `move_knight`
- Cualquier acción que modifique estado

**Problema sin idempotencia:**

```
Cliente: Juego carta + ataque + cambio turno
Servidor: Procesa exitosamente
Cliente: No recibe ACK por timeout/lag → Reintenta
Servidor: Ejecuta TODO OTRA VEZ

Resultado:
❌ Carta jugada 2 veces
❌ Ataque x2 (daño duplicado)
❌ Turno saltado (cambió 2 veces)
```

**Solución: action_id en TODOS los payloads**

```gdscript
# play_card
{
    "event": "play_card",
    "data": {
        "match_id": "...",
        "action_id": generate_uuid(),  # 👈 SIEMPRE
        "card_id": "...",
        "zone": "field_knight",
        "timestamp": Time.get_ticks_msec()
    }
}

# attack
{
    "event": "attack",
    "data": {
        "match_id": "...",
        "action_id": generate_uuid(),  # 👈 SIEMPRE
        "attacker_id": "...",
        "defender_id": "...",
        "timestamp": Time.get_ticks_msec()
    }
}

# end_turn
{
    "event": "end_turn",
    "data": {
        "match_id": "...",
        "action_id": generate_uuid(),  # 👈 SIEMPRE
        "timestamp": Time.get_ticks_msec()
    }
}
```

**Servidor registra TODAS las acciones:**

```typescript
// ProcessedActions tabla
// Columns: id, match_id, client_action_id, action_type, executed_at, result

async handlePlayCard(ws: WebSocket, data: any) {
    const clientActionId = data.action_id;
    
    // Verificar si ya procesamos
    const existing = await ProcessedAction.findOne({
        where: { client_action_id: clientActionId, match_id: data.match_id }
    });
    
    if (existing) {
        console.log("⚠️ Acción duplicada:", clientActionId);
        // Devolver el estado actual sin repetir lógica
        return this.sendMatchState(ws, data.match_id);
    }
    
    // Ejecutar acción
    const result = await this.gameEngine.playCard(data);
    
    // Registrar como procesada
    await ProcessedAction.create({
        match_id: data.match_id,
        client_action_id: clientActionId,
        action_type: 'play_card',
        executed_at: new Date(),
        result: 'success'
    });
    
    // Broadcast resultado
    this.broadcastToMatch(data.match_id, {
        event: 'match_updated',
        data: result.gameState
    });
}
```

**Beneficio:** Si el cliente reintenta, el servidor:
- ✅ Detecta el duplicado por `client_action_id`
- ✅ Devuelve el estado actual sin repetir ejecución
- ✅ Cero corrupciones de estado

---

---

## 🎬 Animación Después de Sincronización

**⚠️ PRINCIPIO IMPORTANTE:**

> No recalcules en el cliente. Anima hacia el estado que vino del servidor.

**❌ Problema: Recalcular daño**

```gdscript
# MAL: El cliente calcula el daño
func animate_attack():
    var damage = calculate_damage(attacker, defender)  # ❌ Recalcular
    defender.health -= damage
    animate_damage_popup(damage)
    
    # Luego servidor envía otro valor → desincronización
```

**✅ Correcto: Animar hacia el estado del servidor**

```gdscript
# Flujo correcto:
# 1. Cliente envía attack command (sin calcular daño)
# 2. Servidor calcula, aplica, persiste
# 3. Servidor envía match_updated con nuevo estado
# 4. Cliente guarda estado ANTERIOR al update
# 5. Cliente anima diferencia ENTRE estados

var state_before_update: Dictionary
var state_after_update: Dictionary

func _on_match_updated(new_state: Dictionary):
    state_before_update = game_state.to_dict()  # Guardar estado actual
    
    # Aplicar snapshot del servidor
    game_state.sync_from_server(new_state)
    state_after_update = game_state.to_dict()
    
    # Detectar qué cambió
    var changes = _detect_changes(state_before_update, state_after_update)
    
    # Animar cambios
    _animate_changes(changes)

func _detect_changes(before: Dictionary, after: Dictionary) -> Dictionary:
    var changes = {}
    
    # Comparar salud de caballeros
    for instance_id in after.cards_in_play:
        var card_before = before.cards_in_play.get(instance_id, {})
        var card_after = after.cards_in_play[instance_id]
        
        if card_before.get("life", 0) != card_after.get("life", 0):
            changes[instance_id] = {
                "life_from": card_before.get("life", 0),
                "life_to": card_after.get("life", 0)
            }
    
    return changes

func _animate_changes(changes: Dictionary):
    for instance_id, change in changes.items():
        var card_display = get_card_display(instance_id)
        var damage = change.life_from - change.life_to
        
        # Animar solo lo que cambió
        if damage > 0:
            animate_damage_popup(card_display, damage)
        elif damage < 0:
            animate_heal_popup(card_display, abs(damage))
```

**Regla de Oro:**
```
Servidor = Fuente de Verdad
Cliente = Animador de Verdad

Del servidor NUNCA se calcula.
Del servidor SIEMPRE se anima.
```

---

## 🔐 Transacciones Atómicas (Servidor)

**⚠️ CRÍTICO: Sin esto, el estado se corrompe silenciosamente**

**Problema:**

```typescript
// ❌ MAL: Sin transacción

// Paso 1: Crear carta en juego
await CardInPlay.create({ ... });

// Paso 2: Restar cosmos
match.player1_cosmos -= card.cost;

// ⚠️ SI AQUÍ FALLAErrro de BD

// Paso 3: Cambiar turno
match.current_player = 2;

// Resultado: Carta fue creada, pero cosmos NO se restó
// ¿Qué pasa en el cliente? Conflicto de estado.
```

**Solución: BEGIN TRANSACTION**

```typescript
// ✅ BIEN: Con transacción

async executePlayCard(match: Match, cardData: any, playerId: string) {
    // Iniciar transacción
    const transaction = await sequelize.transaction();
    
    try {
        // PASO 1: Validaciones
        if (match.player1_cosmos < cardData.cost) {
            throw new Error("No tienes cosmos suficiente");
        }
        
        // PASO 2: Crear carta en juego
        const cardInPlay = await CardInPlay.create(
            {
                match_id: match.id,
                card_id: cardData.id,
                player_number: playerNumber,
                zone: 'field_knight'
            },
            { transaction }  // 👈 Dentro de transacción
        );
        
        // PASO 3: Restar cosmos
        match.player1_cosmos -= cardData.cost;
        await match.save({ transaction });
        
        // PASO 4: Registrar acción
        await ProcessedAction.create(
            {
                match_id: match.id,
                client_action_id: clientActionId,
                action_type: 'play_card'
            },
            { transaction }
        );
        
        // ✅ Si llegamos aquí, TODO falló o TODO tuvo éxito
        await transaction.commit();
        
        return { success: true, cardInPlay };
        
    } catch (error) {
        // ❌ Si algo falló, TODO se revierte
        await transaction.rollback();
        
        console.error(`Rollback: ${error.message}`);
        throw error;
    }
}
```

**Garantía importante:**
- Todas las operaciones se ejecutan
- O **ninguna** se ejecuta
- No hay estados intermedios corruptos

---

## 🏗️ Arquitectura de Módulos del Servidor

**Problema actual:** Todo mezclado en WebSocketService = Monolito caótico

**Solución: Capas claras y testeable**

### Arquitectura Recomendada

```
┌─────────────────────────────────────────────┐
│  WebSocketGateway                           │
│  (Comunicación + Autenticación)             │
│  - Parser de mensajes                       │
│  - Validación de JWT                        │
│  - Routing a handlers                       │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  MatchCommandHandler                        │
│  (Validación inicial + Orquestación)        │
│  - Validar usuario en match                 │
│  - Validar tipo de acción                   │
│  - Delegar a GameRulesEngine                │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  GameRulesEngine                            │
│  (Lógica pura de juego)                     │
│  - executePlayCard()                        │
│  - executeAttack()                          │
│  - executeEndTurn()                         │
│  - checkWinConditions()                     │
│  - applyEffects()                           │
│  - calculateDamage()                        │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  MatchRepository                            │
│  (Persistencia + Transacciones)             │
│  - Match CRUD                               │
│  - CardInPlay CRUD                          │
│  - ProcessedAction CRUD                     │
│  - Query helpers                            │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  MatchStateBuilder                          │
│  (Serialización de respuestas)              │
│  - Construir payload match_updated          │
│  - Filtrar datos privados                   │
│  - Formato para cliente                     │
└────────────┬────────────────────────────────┘
             │
┌────────────▼────────────────────────────────┐
│  WebSocketGateway.broadcast()               │
│  (Envío)                                    │
└─────────────────────────────────────────────┘
```

### Responsabilidades Claras

**WebSocketGateway:**
- ✅ Parsear mensajes JSON
- ✅ Autenticar usuario (JWT)
- ✅ Rutear evento a handler
- ✅ Capturar excepciones
- ❌ NO ejecutar lógica de juego

**MatchCommandHandler:**
- ✅ Validar que usuario está en match
- ✅ Validar que es su turno (si aplica)
- ✅ Validar formato del payload
- ✅ Llamar GameRulesEngine
- ✅ Manejo de transacciones
- ❌ NO calcular daño, NO validar reglas complejas

**GameRulesEngine:**
- ✅ `executePlayCard(match, cardData, playerNumber)`
- ✅ `executeAttack(match, attackerId, defenderId)`
- ✅ `executeEndTurn(match, playerNumber)`
- ✅ `checkWinConditions(match)`
- ✅ `applyEffects(match, card, target)`
- ❌ NO sabe de WebSocket
- ❌ NO hace persistencia
- ❌ NO construye payloads

**MatchRepository:**
- ✅ `findById(matchId)`
- ✅ `update(match, transaction?)`
- ✅ `createCardInPlay(data, transaction?)`
- ✅ `markActionProcessed(actionId, transaction?)`
- ❌ NO ejecuta lógica
- ❌ Sin transacciones explícitas (caller las controla)

**MatchStateBuilder:**
- ✅ `buildFullState(match, playerNumber)`
- ✅ `buildCardsList(match, playerNumber)`
- ✅ Filtrar datos privados (mano del oponente)
- ✅ Formato JSON para cliente
- ❌ NO cambia estado
- ❌ NO persiste

### Beneficios

| Aspecto | Monolito | Arquitectura |
|---------|----------|--------------|
| **Testable** | ❌ Difícil | ✅ Cada módulo por separado |
| **Escalable** | ❌ Caótico | ✅ Agregar acciones sin tocar todo |
| **Debuggeable** | ❌ 200+ líneas | ✅ Stack trace claro |
| **Reutilizable** | ❌ Acoplado | ✅ GameRulesEngine en tests/IAs |
| **Mantenible** | ❌ Cambia todo | ✅ Cambios localizados |

---

## 🧪 Aplicar a todas las acciones: play_card, attack, etc.

Este mismo patrón se replica para TODAS las acciones:

1. **Cliente envía action_id + payload**
2. **MatchCommandHandler valida**
3. **GameRulesEngine ejecuta dentro de transacción**
4. **MatchRepository persiste**
5. **MatchStateBuilder serializa**
6. **Broadcast a ambos jugadores**

Esto garantiza:
- ✅ Idempotencia (action_id)
- ✅ Atomicidad (transacción)
- ✅ Consistencia (lógica pura)
- ✅ Testabilidad (módulos desacoplados)

## 🔌 Reconexión y Resync Completo

**Problema:** Usuario desconecta y reconecta. ¿Qué estado usa? ¿El local (desactualizado) o el del servidor?

**Solución: Snapshot Completo**

```typescript
// Servidor - NUEVO ENDPOINT
app.get('/api/matches/:matchId/state', async (req, res) => {
    const match = await Match.findByPk(req.params.matchId);
    
    if (!match || (match.player1_id !== req.user.id && match.player2_id !== req.user.id)) {
        return res.status(403).json({ error: 'No acceso' });
    }
    
    // Estado canónico completo
    const snapshot = {
        match_id: match.id,
        turn_number: match.turn_number,
        current_player: match.current_player,
        phase: match.phase,
        
        player1: {
            id: match.player1_id,
            life: match.player1_life,
            cosmos: match.player1_cosmos
        },
        player2: {
            id: match.player2_id,
            life: match.player2_life,
            cosmos: match.player2_cosmos
        },
        
        cards_in_play: await CardInPlay.findAll({ where: { match_id: match.id } }),
        
        server_timestamp: Date.now()
    };
    
    res.json(snapshot);
});
```

```gdscript
# Cliente - Al reconectar
func _on_reconnected():
    print("🔌 Reconectando...")
    
    var match_id = MatchManager._current_match.id
    var response = await NetworkManager.get_request(
        "/api/matches/%s/state" % match_id
    )
    
    if response.status == 200:
        # 👈 Ignorar estado local completamente
        game_state.clear()
        
        # 👈 Usar snapshot del servidor
        game_state.sync_from_server(response.data)
        
        print("✅ Estado resincronizado desde servidor")
        emit_signal("game_state_updated", game_state)
    else:
        print("❌ Error obteniendo estado, cerrando match")
        _on_match_connection_lost()
```

**Beneficio:** Ningún fantasma de estado viejo. Cliente y servidor siempre **en sync**. ✅

---

## 🏗️ Separación de Responsabilidades

Tu diseño actual probablemente tiene todo en WebSocketService. **Mala idea a largo plazo.**

**Propuesta de arquitectura escalable:**

```
WebSocketService (Comunicación)
├─ Parsear mensajes
├─ Desempaquetar eventos
├─ Llamar handlers
└─ Broadcast resultados

MatchManager - Godot (Orquestación de cliente)
├─ Validar precondiciones
├─ Construir payloads
├─ Coordinar componentes
└─ Emitir signals

GameRulesEngine (Lógica de Juego)  ← 👈 NUEVO
├─ executeEndTurn()
├─ executePlayCard()
├─ executeAttack()
├─ checkWinConditions()
├─ calculateDamage()
└─ applyEffects()

MatchRepository (Persistencia)  ← 👈 NUEVO
├─ Match CRUD
├─ CardInPlay CRUD
├─ ProcessedAction CRUD
└─ Query helper
```

**Ejemplo de separación:**

```typescript
// ❌ MAL: Todo mezclado en WebSocketService
async handleEndTurn(ws, data) {
    const match = await Match.findByPk(data.match_id);
    match.current_player = match.current_player === 1 ? 2 : 1;
    // ... 200 líneas más de lógica ...
    await match.save();
}

// ✅ BIEN: Responsabilidades claras
async handleEndTurn(ws: WebSocket, data: any) {
    const match = await this.matchRepository.findByIdOrThrow(data.match_id);
    
    // WebSocketService valida y orquesta
    if (!this.validateEndTurn(match, ws.userId)) {
        return this.sendError(ws, "Validación fallida");
    }
    
    // GameRulesEngine ejecuta lógica
    const result = await this.gameRulesEngine.endTurn(match, data.action_id);
    
    // Repository persiste
    await this.matchRepository.updateMatch(result.match);
    
    // Broadcast resultado
    this.broadcastToMatch(data.match_id, {
        event: 'match_updated',
        data: result.state
    });
}
```

**Beneficios:**
- Testeable (cada componente por separado)
- Escalable (agregar nuevos eventos sin tocar todo)
- Mantenible (cambios localizados)
- Reutilizable (GameRulesEngine en tests, IAs, etc.)

---

## 🔐 Seguridad del Tiempo: El Servidor es Dueño del Tiempo

**Problema sutil:**
```gdscript
# Cliente envía timestamp
var payload = {
    "timestamp": Time.get_ticks_msec()  # ❌ Timers del cliente pueden estar sincronizados
}
```

```typescript
// Servidor confía: ❌ PELIGRO
if (serverTime - data.timestamp > 5000) {
    // Rechazar como "muy antiguo"
}

// Cliente hackea: Envía timestamp de hace 1 hora
// → Servidor acepta acción fuera del turno esperado
```

**Regla de oro:**

```
🔒 El servidor es el único dueño del tiempo oficial
```

```typescript
// ✅ BIEN: Servidor es autoridad
async handleEndTurn(ws: WebSocket, data: any) {
    // Ignorar timestamp del cliente, usar el del servidor
    const serverTime = Date.now();
    
    // Validar basado en timestamps internos del match
    if (match.last_action_timestamp && 
        (serverTime - match.last_action_timestamp < 500)) {
        this.sendError(ws, "Acción más rápida de lo permitido");
        return;
    }
    
    // Usar timestamp del servidor en match actualizado
    match.last_action_timestamp = serverTime;
    
    // Para Godot: enviar servidor_timestamp para debug
    // Pero NUNCA usarlo para validaciones críticas
}
```

**Cliente: Usar timestamps SOLO para UI (animaciones, etc.)**

```gdscript
# En Godot: mostrar contador de turno, no hacer validaciones
var turn_timer = 0.0
var max_turn_time = 120.0  # Puramente cosmético

func _process(delta):
    if is_player_turn():
        turn_timer += delta
        turn_display.text = "Tiempo: %.1f" % (max_turn_time - turn_timer)
        
        # ⚠️ NUNCA hacer lógica crítica basada en este timer
```

---

## Extensibilidad Futura: Fases

Cuando implemente fases, el flujo se modifica así:

### Versión Actual (Simple)
```
Turno A: [Fase Única] → End Turn → Turno B
```

### Versión Futura (Con Fases)
```
Turno A:
  ├─ Main Phase
  │  └─ End Phase → Next Phase (si hay)
  ├─ Battle Phase
  │  └─ End Phase → Next Phase
  └─ End Phase → cambiar jugador → Turno B
```

**Cambios necesarios:**

```typescript
// En lugar de solo current_player:
match.current_phase = 'main';  // 'main' | 'battle' | 'end'

// end_turn() podría avanzar fase en lugar de turno:
async handleEndTurn() {
    const phases = ['main', 'battle', 'end'];
    const currentPhaseIndex = phases.indexOf(match.current_phase);
    
    if (currentPhaseIndex < phases.length - 1) {
        // Avanzar a siguiente fase
        match.current_phase = phases[currentPhaseIndex + 1];
    } else {
        // Es end_phase, cambiar jugador y resetear fase
        match.current_player = match.current_player === 1 ? 2 : 1;
        match.current_phase = 'main';
    }
}
```

**El cliente NO debe asumir que end_turn cambia el jugador automáticamente.**

---

## Resumen de Responsabilidades

### GameMatch (UI - Godot)
- ✅ Validar que es su turno antes de permitir acciones
- ✅ Mostrar indicador visual "Tu turno" / "Turno del oponente"
- ✅ Habilitar/deshabilitar interacción según turno
- ✅ Animar cambios comparando estado anterior vs nuevo
- ✅ NUNCA recalcular efectos/daño (usar lo que vino del servidor)
- ❌ NO cambiar game_state
- ❌ NO ejecutar lógica de juego

### MatchManager (Orquestador de Cliente - Godot)
- ✅ Verificar precondiciones básicas antes de enviar
- ✅ Generar action_id único para CADA acción
- ✅ Construir payload con action_id + timestamp
- ✅ Recibir snapshot del servidor y validar secuencia
- ✅ Sincronizar GameState con estado del servidor
- ✅ Emitir signals de cambio (turn_changed, game_state_updated)
- ✅ Detectar cambios comparando estado antes vs después
- ❌ NO modificar game_state antes de confirmación del servidor
- ❌ NO confiar en validaciones del cliente

### WebSocketGateway (Comunicación - TypeScript)
- ✅ Parsear mensajes JSON
- ✅ Validar JWT del usuario
- ✅ Rutear evento al MatchCommandHandler correcto
- ✅ Capturar excepciones y enviar errores
- ✅ Broadcast de resultados a jugadores
- ❌ NO ejecutar lógica de juego
- ❌ NO hacer persistencia

### MatchCommandHandler (Validación - TypeScript)
- ✅ Validar que usuario es jugador en match
- ✅ Validar que es su turno (si aplica)
- ✅ Validar formato del payload
- ✅ Verificar si acción está duplicada (ProcessedActions)
- ✅ Llamar a GameRulesEngine
- ✅ Iniciar transacción de base de datos
- ❌ NO calcular daño/efectos
- ❌ NO validar reglas de juego complejas

### GameRulesEngine (Lógica Pura - TypeScript)
- ✅ `executePlayCard(match, cardData, playerNumber, transaction)`
- ✅ `executeAttack(match, attackerId, defenderId, transaction)`
- ✅ `executeEndTurn(match, playerNumber, transaction)`
- ✅ `checkWinConditions(match)`
- ✅ `applyEffects(match, card, target, transaction)`
- ✅ `calculateDamage(attacker, defender)`
- ❌ NO sabe de WebSocket
- ❌ NO hace persistencia
- ❌ NO construye payloads
- ❌ Transacciones las controla el caller

### MatchRepository (Persistencia - TypeScript)
- ✅ `findById(matchId)`
- ✅ `updateMatch(match, transaction?)`
- ✅ `createCardInPlay(data, transaction?)`
- ✅ `updateCardInPlay(card, transaction?)`
- ✅ `markActionProcessed(clientActionId, transaction?)`
- ✅ Abstraer queries complejas
- ❌ NO ejecuta lógica
- ❌ NO inicia transacciones
- ✅ Recibe transacción como parámetro

### MatchStateBuilder (Serialización - TypeScript)
- ✅ `buildFullState(match, playerNumber)`
- ✅ `buildCardsList(match, playerNumber)`
- ✅ Filtrar datos privados (mano oponente, deck)
- ✅ Formato JSON para cliente
- ✅ Incluir versionado (turn_number, action_sequence)
- ❌ NO cambia estado
- ❌ NO persiste
- ❌ NO ejecuta lógica

### GameState (Sincronización - Godot)
- ✅ Almacenar estado actual desde servidor
- ✅ Almacenar versionado (turn_number, action_sequence, last_applied_*)
- ✅ Proporcionar métodos de consulta (is_my_turn(), etc.)
- ✅ Guardar estado anterior para detección de cambios
- ❌ NO modificarse sin comando del servidor
- ❌ NO ejecutar lógica

### Servidor (Autoridad General - TypeScript)
- ✅ Validar que usuario está en match (antes de delegar)
- ✅ Validar que es su turno (antes de delegar)
- ✅ Ejecutar lógica dentro de transacción atómica
- ✅ Persistir cambios de forma consistente
- ✅ Broadcast estado actualizado a ambos jugadores
- ✅ Rechazar acciones duplicadas (action_id)
- ✅ NUNCA confiar en datos del cliente sin validar
- ❌ NO usar timestamps del cliente para lógica crítica
- ❌ NO asumir estado del cliente

---

## Principios Core

```
1️⃣ CLIENT PROPOSES, SERVER DECIDES
   └─ Cliente sugiere acciones, servidor las autoriza

2️⃣ STATE SYNCHRONIZATION
   └─ El servidor es la fuente de verdad única

3️⃣ NO LOCAL MUTATION
   └─ El cliente NO modifica su estado hasta confirmación

4️⃣ TIMEOUT RESILIENCE
   └─ El cliente nunca asume éxito, siempre espera respuesta

5️⃣ FUTURE-PROOF
   └─ Diseño extensible para fases, efectos, validaciones complejas
```

---

## Checklist de Implementación

### Fase 0: Arquitectura (PRIMERO)
- [ ] Crear 5 módulos: WebSocketGateway, MatchCommandHandler, GameRulesEngine, MatchRepository, MatchStateBuilder
- [ ] GameRulesEngine no tiene dependencias de WebSocket/HTTP
- [ ] MatchRepository abstraye acceso a base de datos
- [ ] Transacciones atómicas en MatchRepository
- [ ] ProcessedActions tabla creada

### Fase 1: Idempotencia (CRÍTICO)
- [ ] Tabla ProcessedActions con client_action_id, action_type, executed_at, result
- [ ] TODOS los eventos llevan action_id UUID (play_card, attack, end_turn, etc.)
- [ ] MatchCommandHandler verifica ProcessedActions antes de ejecutar
- [ ] Si acción duplicada, devolver estado actual sin repetir lógica
- [ ] Logging de intentos duplicados

### Fase 2: Versionado y Secuencia (IMPORTANTE)
- [ ] Todos los eventos llevan turn_number + action_sequence
- [ ] GameState almacena last_applied_turn + last_applied_sequence
- [ ] Cliente valida _is_valid_sequence() antes de aplicar update
- [ ] Detectar eventos fuera de orden y pedir resync
- [ ] Servidor incrementa action_sequence con cada evento

### Fase 3: Snapshot Completo (Sincronización)
- [ ] Servidor envía SNAPSHOT COMPLETO, no deltas
- [ ] Payload contiene completo: cartas, recursos, estado
- [ ] GameState.sync_from_server() aplica snapshot atómico
- [ ] MatchStateBuilder.buildFullState() filters datos privados
- [ ] Optim

ización de snapshot para después (si es necesario)

### Fase 4: Animación Correcta (Cliente)
- [ ] Guardar estado ANTES de aplicar update
- [ ] Comparar estado anterior vs nuevo
- [ ] Animar SOLO las diferencias
- [ ] NUNCA recalcular daño/efectos en cliente
- [ ] Efectos visuales basados en deltas, no en lógica

### Fase 5: Transacciones Atómicas (Servidor)
- [ ] BEGIN TRANSACTION al inicio de cada acción
- [ ] Todas las operaciones dentro de transacción
- [ ] COMMIT solo si TODO es exitoso
- [ ] ROLLBACK si cualquier paso falla
- [ ] Logging de rollbacks

### Fase 6: Reconexión y Resync
- [ ] Endpoint GET /api/matches/:matchId/state snapshot completo
- [ ] Cliente al reconectar limpia estado local
- [ ] Cliente aplica snapshot del servidor
- [ ] Validar secuencias después de resync

### Testing
- [ ] Test: action_id duplicado → servidor devuelve mismo estado
- [ ] Test: eventos fuera de orden → cliente rechaza
- [ ] Test: transacción falla a mitad → rollback completo
- [ ] Test: servidor envía snapshot, cliente anima correctamente
- [ ] Test: reconexión recupera estado sin corrupción
- [ ] Load test: 100 acciones simultáneas → todas atómicas

---

## Logs Esperados

### Con End Turn Exitoso
```
✅ Iniciado desde MatchManager.end_turn() en Godot
   - Verificación: is_in_match = true
   - Verificación: is_my_turn() = true
   - Enviando evento "end_turn" al servidor

✅ Servidor procesa (handleEndTurn)
   - Match validado: OK
   - Player validado: OK
   - Reseteando exhausted cards...
   - Incrementando cosmos de X a Y
   - Robando carta: [CARD_ID]
   - Cambiando jugador: 1 → 2
   - Broadcasting match_updated...

✅ Cliente recibe match_updated
   - GameState sincronizado
   - Turn cambió de N a N+1
   - Player cambió de 1 a 2
   - Emitiendo: turn_changed(2)

✅ GameMatch reacciona
   - Es turno del oponente
   - Deshabilitando interacción
```

---

## Conclusión

Este diseño garantiza que:

✅ **Autoridad del servidor**: Nunca es burlado, todas las validaciones en servidor  
✅ **Idempotencia**: action_id en TODOS los eventos, reintentos seguros  
✅ **Atomicidad**: Transacciones garantizan consistencia o rollback  
✅ **Versionado**: turn_number + action_sequence evitan caos de orden  
✅ **Snapshot completo**: Sin deltas perdidas, sincronización confiable  
✅ **Animación correcta**: Cliente anima diffs, nunca recalcula  
✅ **Arquitectura escalable**: 5 capas desacopladas y testeable  
✅ **Sin estado fantasma**: Timestamps del servidor, nunca del cliente  
✅ **Reconexión elegante**: Resync completo recupera verdad del servidor  

### Reglas de Oro (MEMORIZAR)

```
🔒 NUNCA confíes en el cliente
   - Timestamps ❌
   - IDs ❌
   - Validaciones ❌
   - Cálculos ❌

🔄 SIEMPRE valida TODO en el servidor
   - Usuario en match
   - Es su turno
   - Tiene recursos
   - Acción no duplicada

✅ SIEMPRE usa transacciones atómicas
   - BEGIN TRANSACTION
   - Ejecutar lógica
   - COMMIT o ROLLBACK completo

🎯 SIEMPRE envía action_id en TODOS los eventos
   - play_card
   - attack
   - end_turn
   - activate_technique
   - Cualquier acción

📊 SIEMPRE envía snapshot completo
   - No deltas parciales
   - Versión completa del estado
   - turn_number + action_sequence

🎬 NUNCA recalcules en cliente
   - Anima hacia destino (servidor)
   - Compara antes/después
   - Visualiza diferencias
   - Nunca ejecutes lógica

🔌 SIEMPRE ofrece resync después de reconexión
   - GET /api/matches/:id/state
   - Limpia estado local
   - Aplica snapshot
   - Valida secuencias después

🏗️ SIEMPRE separa responsabilidades
   - WebSocketGateway: Comunicación
   - MatchCommandHandler: Validación
   - GameRulesEngine: Lógica pura
   - MatchRepository: Persistencia
   - MatchStateBuilder: Serialización

🕐 NUNCA uses timestamps del cliente para lógica crítica
   - Solo para UI cosmética
   - Servidor ownea el tiempo oficial
   - Validaciones basadas en servidor timestamps
```

### Mapa Mental Final

```
Cliente:                Servidor:
┌────────────────┐     ┌────────────────────────────────┐
│ GameMatch      │     │ WebSocketGateway               │
│ (UI + Validar) │     │ (Parse + Auth)                 │
└────────┬───────┘     └────────────┬───────────────────┘
         │                          │
         │ send:                    │
         │ action_id                │
         │ payload                  │
         │                          │
         └──────────────────────────▶
                                    │
                  ┌─────────────────▼──────────────────┐
                  │ MatchCommandHandler                │
                  │ (Valida básico)                    │
                  └─────────────────┬──────────────────┘
                                    │
                  ┌─────────────────▼──────────────────┐
                  │ BEGIN TRANSACTION                  │
                  │   GameRulesEngine.execute()        │
                  │   MatchRepository.update()         │
                  │ COMMIT / ROLLBACK                  │
                  └─────────────────┬──────────────────┘
                                    │
                  ┌─────────────────▼──────────────────┐
                  │ MatchStateBuilder                  │
                  │ (Snapshot completo)                │
                  └─────────────────┬──────────────────┘
                                    │
                                    │ broadcast:
                                    │ snapshot
                                    │ turn_number
                                    │ action_sequence
                                    │
         ┌──────────────────────────▼────────────────┐
         │                                           │
┌────────▼───────┐                        ┌─────────▼─────┐
│ MatchSession   │                        │ MatchSession  │
│ Service        │                        │ Service       │
│ (Orquestador)  │                        │ (Orquestador) │
└────────┬───────┘                        └─────────┬─────┘
         │                                          │
┌────────▼──────────────────────────────────────────▼─────┐
│ GameState                                              │
│ - Valida! Versionado (turn_number)                     │
│ - Detecta cambios (state_before vs after)              │
│ - Emit: turn_changed, game_state_updated               │
└────────┬──────────────────────────────────────────────┘
         │
┌────────▼───────┐
│ GameMatch      │
│ - Anima cambios│
│ - Nunca calcula│
└────────────────┘
```

---

**Este documento es la especificación completa y lista para implementar.**

Todos los puntos están cubiertos:
- ✅ Idempotencia
- ✅ Versionado
- ✅ Sincronización
- ✅ Animación
- ✅ Transacciones
- ✅ Arquitectura
- ✅ Seguridad
- ✅ Testing

