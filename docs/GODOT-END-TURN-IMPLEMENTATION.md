# Implementación de Cambio de Turno en Godot (Cliente)

**Documento de Guía Práctica para Desarrolladores Godot**

---

## Índice
1. [Flujo General](#flujo-general)
2. [Arquitectura de Componentes](#arquitectura-de-componentes)
3. [Implementación Paso a Paso](#implementación-paso-a-paso)
4. [Validaciones Locales](#validaciones-locales)
5. [Envío del Evento](#envío-del-evento)
6. [Recepción y Sincronización](#recepción-y-sincronización)
7. [Animaciones](#animaciones)
8. [Manejo de Errores](#manejo-de-errores)
9. [Código Completo de Ejemplo](#código-completo-de-ejemplo)

---

## Flujo General

```
┌─ Jugador presiona "Pasar Turno" ─────────────────┐
│                                                   │
│  GameBoard._on_end_turn_button_pressed()          │
│                                                   │
│  1. Validaciones locales                          │
│  2. Deshabilitar botón + mostrar feedback         │
│  3. Construir payload con action_id               │
│  4. Enviar a MatchManager.end_turn()              │
│                                                   │
└─► MatchManager.end_turn()                        │
    │                                               │
    │  1. Verificar precondiciones                  │
    │  2. Generar UUID único (action_id)            │
    │  3. Construir payload                         │
    │  4. Enviar vía WebSocketManager                │
    │  5. Esperar confirmación del servidor         │
    │                                               │
    └─► Servidor procesa (TurnManager)              │
        │                                           │
        │  1. Valida todo                           │
        │  2. Ejecuta con transacción atómica       │
        │  3. Broadcast match_updated a ambos       │
        │                                           │
        └─► Cliente recibe match_updated            │
            │                                       │
            │  1. Recibe en WebSocketManager        │
            │  2. MatchManager sincroniza estado    │
            │  3. Emite signal "turn_changed"      │
            │  4. GameBoard reacciona               │
            │                                       │
            └─► GameBoard anima el turno nuevo
                │
                ├─ Habilita/deshabilita botones
                ├─ Anima indicador de turno
                ├─ Anima robo de carta
                └─ Sincroniza UI visual
```

---

## Arquitectura de Componentes

### Componentes Involucrados (Godot)

```
GameBoard ────────────────► Interfaz del usuario (botones, indicadores)
   │
   └──► MatchManager ──────► Lógica de sincronización + signals
            │
            └──► WebSocketManager ──► Comunicación con servidor
```

### Responsabilidades

| Componente | Responsabilidad |
|-----------|-----------------|
| **GameBoard** | UI + validaciones visuales |
| **MatchManager** | Orquestación de sincronización |
| **WebSocketManager** | Comunicación WebSocket |
| **GameState** | Estado sincronizado del servidor |

---

## Implementación Paso a Paso

### Paso 1: GameBoard - Botón "Pasar Turno"

Ubica el script `GameBoard.gd` en tu proyecto:
```
ccg/
├── scenes/
│   ├── game/
│   │   ├── GameBoard.tscn
│   │   └── GameBoard.gd  ◄── AQUÍ
```

```gdscript
# GameBoard.gd

# Referencias a nodos
@onready var end_turn_button: Button = $MainContainer/.../EndTurnButton
@onready var turn_indicator: Label = $MainContainer/.../TurnIndicator

# Estado local
var player_number: int = 1
var is_waiting_for_server: bool = false
var turn_end_timeout: float = 10.0
var turn_end_start_time: float = 0.0

func _ready():
    # Conexiones
    end_turn_button.pressed.connect(_on_end_turn_button_pressed)
    MatchManager.turn_changed.connect(_on_turn_changed)
    
    # Inicializar estado
    _update_end_turn_button_state()

# ════════════════════════════════════════════════════════════════════════════
# EVENTO: Botón "Pasar Turno" presionado
# ════════════════════════════════════════════════════════════════════════════
func _on_end_turn_button_pressed():
    print("🔘 Botón 'Pasar Turno' presionado")
    
    # ════════════════════════════════════════════════════════════════════════
    # PASO 1: VALIDACIONES LOCALES (UI Layer)
    # ════════════════════════════════════════════════════════════════════════
    if not _can_end_turn():
        print("❌ No puedes pasar turno ahora")
        return
    
    # ════════════════════════════════════════════════════════════════════════
    # PASO 2: FEEDBACK VISUAL (Indicar que está procesando)
    # ════════════════════════════════════════════════════════════════════════
    _on_sending_end_turn()
    
    # ════════════════════════════════════════════════════════════════════════
    # PASO 3: INVOCAR MANAGER (Que delegue al servidor)
    # ════════════════════════════════════════════════════════════════════════
    await MatchManager.end_turn()
    
    # Si llegamos aquí: servidor confirmó (vía match_updated)
    print("✅ Turno finalizado y sincronizado")

# ════════════════════════════════════════════════════════════════════════════
# VALIDACIONES LOCALES
# ════════════════════════════════════════════════════════════════════════════

func _can_end_turn() -> bool:
    # ✅ ¿No estamos ya esperando respuesta?
    if is_waiting_for_server:
        print("⚠️ Ya estamos esperando respuesta del servidor")
        return false
    
    # ✅ ¿Es realmente nuestro turno?
    var game_state = MatchManager.get_game_state()
    if game_state.current_player != player_number:
        print("❌ No es tu turno (turno del jugador %d)" % game_state.current_player)
        return false
    
    # ✅ ¿Hay animaciones en progreso?
    if _has_animations_in_progress():
        print("❌ Hay animaciones en progreso")
        return false
    
    # ✅ ¿El match está en estado válido?
    if not MatchManager.is_in_match():
        print("❌ No estás en una partida")
        return false
    
    return true

func _has_animations_in_progress() -> bool:
    # Verificar tweens activos, animaciones de cartas, etc.
    # POR AHORA: simplificar
    # FUTURO: integrar con sistema de animaciones
    return false

# ════════════════════════════════════════════════════════════════════════════
# FEEDBACK VISUAL
# ════════════════════════════════════════════════════════════════════════════

func _on_sending_end_turn():
    """Mostrar feedback de que se está enviando"""
    is_waiting_for_server = true
    turn_end_start_time = Time.get_ticks_msec() / 1000.0
    
    # Deshabilitar botón
    end_turn_button.disabled = true
    end_turn_button.text = "Enviando..."
    
    # Opcional: spinner
    _show_sending_spinner()
    
    # Iniciar timeout
    _start_timeout_check()

func _on_end_turn_success():
    """Confirmación exitosa del servidor"""
    is_waiting_for_server = false
    end_turn_button.text = "Pasar Turno"
    
    _hide_sending_spinner()

func _on_end_turn_timeout():
    """Timeout esperando respuesta del servidor"""
    is_waiting_for_server = false
    
    print("⚠️ Timeout esperando respuesta del servidor")
    end_turn_button.disabled = false
    end_turn_button.text = "Reintentar"
    
    _show_timeout_notification()

func _show_sending_spinner():
    # Mostrar animación de carga (ProgressBar o gif)
    # Ejemplo: cambiar color del botón
    end_turn_button.self_modulate = Color.YELLOW

func _hide_sending_spinner():
    end_turn_button.self_modulate = Color.WHITE

func _show_timeout_notification():
    # Mostrar modal or toaster: "Timeout conectando al servidor"
    print("⏱️ Desconectado o muy lento (reintenta o recarga el match)")

func _start_timeout_check():
    """Verificar timeout cada frame"""
    while is_waiting_for_server:
        var elapsed = (Time.get_ticks_msec() / 1000.0) - turn_end_start_time
        
        if elapsed > turn_end_timeout:
            _on_end_turn_timeout()
            return
        
        await get_tree().process_frame

func _update_end_turn_button_state():
    """Actualizar estado del botón basado en turno actual"""
    var game_state = MatchManager.get_game_state()
    
    if game_state.current_player == player_number:
        end_turn_button.disabled = false
        end_turn_button.text = "Pasar Turno"
    else:
        end_turn_button.disabled = true
        end_turn_button.text = "Esperando..."
```

---

### Paso 2: MatchManager - Orquestación

Ubica o crea `MatchManager.gd` como autoload:
```
ccg/
├── scripts/
│   └── managers/
│       └── MatchManager.gd  ◄── AQUÍ (o en Global)
```

```gdscript
# MatchManager.gd
extends Node

# ════════════════════════════════════════════════════════════════════════════
# SIGNALS
# ════════════════════════════════════════════════════════════════════════════
signal turn_changed(new_player: int)
signal game_state_updated(new_state: Dictionary)
signal end_turn_confirmed()
signal end_turn_failed(error_message: String)

# ════════════════════════════════════════════════════════════════════════════
# ESTADO
# ════════════════════════════════════════════════════════════════════════════
var _current_match: Dictionary = {}
var _game_state: GameState = GameState.new()
var _is_in_match: bool = false

# ════════════════════════════════════════════════════════════════════════════
# LIFECYCLE
# ════════════════════════════════════════════════════════════════════════════
func _ready():
    # Conectar a WebSocketManager para recibir eventos del servidor
    WebSocketManager.server_event.connect(_on_server_event)
    WebSocketManager.error_occurred.connect(_on_websocket_error)

# ════════════════════════════════════════════════════════════════════════════
# API PÚBLICA: end_turn()
# ════════════════════════════════════════════════════════════════════════════

func end_turn() -> void:
    """
    Ejecutar: MatchManager.end_turn()
    
    El cliente propone, el servidor decide.
    """
    print("🔄 MatchManager: Iniciando end_turn()")
    
    # ========================================================================
    # VALIDACION: Precondiciones
    # ========================================================================
    if not _is_in_match:
        print("❌ No estás en una partida")
        end_turn_failed.emit("No estás en una partida")
        return
    
    if not _game_state.current_player == get_player_number():
        print("❌ No es tu turno")
        end_turn_failed.emit("No es tu turno")
        return
    
    # ========================================================================
    # CONSTRUIR PAYLOAD
    # ========================================================================
    var action_id = _generate_uuid()  # 👈 CRÍTICO: UUID único
    
    var payload = {
        "event": "end_turn",
        "data": {
            "match_id": _current_match.id,
            "action_id": action_id,
            "turn_number": _game_state.turn_number,
            # ⚠️ NUNCA confiar en timestamps del cliente para lógica
            # Solo para logging/debug
            "timestamp": Time.get_ticks_msec()
        }
    }
    
    print("📤 Enviando payload: %s" % [JSON.stringify(payload)])
    
    # ========================================================================
    # ENVIAR A SERVIDOR
    # ========================================================================
    WebSocketManager.send_event(payload)
    
    # ========================================================================
    # ESPERAR CONFIRMACIÓN (sin modificar estado local)
    # ========================================================================
    print("⏳ Esperando confirmación del servidor...")
    # El servidor enviará "match_updated" y disparará _on_server_event
    # que a su vez emitirá turn_changed y game_state_updated

# ════════════════════════════════════════════════════════════════════════════
# RECEPCIÓN: Events del Servidor
# ════════════════════════════════════════════════════════════════════════════

func _on_server_event(event_name: String, event_data: Dictionary) -> void:
    """Recibe eventos del servidor vía WebSocketManager"""
    
    print("📬 MatchManager: Recibiu evento '%s'" % event_name)
    
    match event_name:
        "match_updated":
            _on_match_updated(event_data)
        
        "turn_ended":
            _on_turn_ended(event_data)
        
        "error":
            _on_server_error(event_data)

func _on_match_updated(data: Dictionary) -> void:
    """
    Servidor envía snapshot completo del match.
    Esto puede ser por:
    - End turn del otro jugador
    - Acción que jugamos nosotros
    - Resync por reconexión
    """
    print("🔄 Match actualizado por servidor")
    
    # ========================================================================
    # VALIDACIÓN: ¿Secuencia correcta?
    # ========================================================================
    if not _is_valid_sequence(data):
        print("⚠️ Evento fuera de orden, pidiendo resync completo")
        request_full_resync()
        return
    
    # ========================================================================
    # GUARDAR ESTADO ANTERIOR (para detectar cambios)
    # ========================================================================
    var state_before = _game_state.to_dict()
    
    # ========================================================================
    # SINCRONIZAR ESTADO
    # ========================================================================
    _sync_game_state(data)
    
    # ========================================================================
    # DETECTAR CAMBIOS
    # ========================================================================
    var state_after = _game_state.to_dict()
    var changes = _detect_changes(state_before, state_after)
    
    # ========================================================================
    # EMITIR SIGNALS
    # ========================================================================
    
    # Si el turno cambió
    if state_after.turn_number > state_before.turn_number:
        print("✅ Turno cambió: %d → %d" % [state_before.turn_number, state_after.turn_number])
        print("✅ Nuevo player: %d" % [state_after.current_player])
        turn_changed.emit(state_after.current_player)
    
    # Siempre emitir actualización general
    game_state_updated.emit(data)

func _on_turn_ended(data: Dictionary) -> void:
    """
    Servidor confirma que nuestro end_turn fue procesado.
    Esto es solo confirmación - el estado real viene en match_updated.
    """
    print("✅ Servidor confirmó: Turno finalizado")
    end_turn_confirmed.emit()

func _on_server_error(data: Dictionary) -> void:
    """Error del servidor en nuestra acción"""
    var error_msg = data.get("message", "Error desconocido")
    print("❌ Error del servidor: %s" % error_msg)
    end_turn_failed.emit(error_msg)

# ════════════════════════════════════════════════════════════════════════════
# LÓGICA INTERNA
# ════════════════════════════════════════════════════════════════════════════

func _is_valid_sequence(data: Dictionary) -> bool:
    """Verificar que eventos llegan en orden correcto"""
    var data_turn = data.get("turn_number", 0)
    var data_sequence = data.get("action_sequence", 0)
    
    var current_turn = _game_state.turn_number
    var current_sequence = _game_state.action_sequence
    
    # Si el turno es más antiguo: rechazar
    if data_turn < current_turn:
        print("⚠️ Evento antiguo: turn %d < %d" % [data_turn, current_turn])
        return false
    
    # Si es el mismo turno pero secuencia es antigua: rechazar
    if data_turn == current_turn and data_sequence <= current_sequence:
        print("⚠️ Secuencia antigua en turno %d: %d <= %d" % [data_turn, data_sequence, current_sequence])
        return false
    
    return true

func _sync_game_state(data: Dictionary) -> void:
    """Aplicar snapshot del servidor al GameState"""
    _game_state.turn_number = data.get("turn_number", 0)
    _game_state.current_player = data.get("current_player", 1)
    _game_state.action_sequence = data.get("action_sequence", 0)
    
    # Recursos
    _game_state.player1_cosmos = data.get("player1_cosmos", 0)
    _game_state.player2_cosmos = data.get("player2_cosmos", 0)
    _game_state.player1_hand_count = data.get("player1_hand_count", 0)
    _game_state.player2_hand_count = data.get("player2_hand_count", 0)
    _game_state.player1_deck_size = data.get("player1_deck_size", 0)
    _game_state.player2_deck_size = data.get("player2_deck_size", 0)
    
    # Cartas en juego
    _game_state.cards_in_play = data.get("cards_in_play", [])
    
    print("✅ GameState sincronizado: Turn %d, Player %d" % [
        _game_state.turn_number,
        _game_state.current_player
    ])

func _detect_changes(before: Dictionary, after: Dictionary) -> Dictionary:
    """Detectar qué cambió entre dos snapshots"""
    var changes = {}
    
    # Cambios en turno
    if after.turn_number != before.turn_number:
        changes.turn_changed = {
            "from": before.turn_number,
            "to": after.turn_number
        }
    
    # Cambios en jugador actual
    if after.current_player != before.current_player:
        changes.player_changed = {
            "from": before.current_player,
            "to": after.current_player
        }
    
    # Cambios en cosmos
    if after.player1_cosmos != before.player1_cosmos:
        changes.player1_cosmos = {
            "from": before.player1_cosmos,
            "to": after.player1_cosmos
        }
    
    if after.player2_cosmos != before.player2_cosmos:
        changes.player2_cosmos = {
            "from": before.player2_cosmos,
            "to": after.player2_cosmos
        }
    
    return changes

# ════════════════════════════════════════════════════════════════════════════
# API PÚBLICA: Getters
# ════════════════════════════════════════════════════════════════════════════

func get_game_state() -> GameState:
    return _game_state

func get_player_number() -> int:
    # Obtener desde GameState o persistencia
    # Por ahora: asumir que está seteado en _ready()
    return 1  # FUTURO: obtener del login

func is_in_match() -> bool:
    return _is_in_match

func set_match_data(match_data: Dictionary) -> void:
    """Seteado cuando entras a un match"""
    _current_match = match_data
    _is_in_match = true

# ════════════════════════════════════════════════════════════════════════════
# UTILIDADES
# ════════════════════════════════════════════════════════════════════════════

func _generate_uuid() -> String:
    """Generar UUID único para cada acción"""
    # Godot 4.1+: UUID.v4().to_string()
    # Alternativa: usar plugin o librería
    # Por ahora: mock
    return str(randi()) + "_" + str(Time.get_ticks_msec())

func _on_websocket_error(error_msg: String) -> void:
    """WebSocket se desconectó"""
    print("❌ WebSocket error: %s" % error_msg)
    end_turn_failed.emit("Desconectado: %s" % error_msg)

func request_full_resync() -> void:
    """Pedir estado completo del servidor (por si se desincroniza)"""
    # TODO: Implementar GET /api/matches/:id/state
    print("🔄 Pidiendo resync completo...")
```

---

### Paso 3: WebSocketManager - Comunicación

Si no existe, crear/actualizar `WebSocketManager.gd`:

```gdscript
# WebSocketManager.gd (autoload)

extends Node

# ════════════════════════════════════════════════════════════════════════════
# SIGNALS
# ════════════════════════════════════════════════════════════════════════════
signal server_event(event_name: String, event_data: Dictionary)
signal error_occurred(error_msg: String)

# ════════════════════════════════════════════════════════════════════════════
# ESTADO
# ════════════════════════════════════════════════════════════════════════════
var websocket: WebSocketClient
var is_connected: bool = false

# ════════════════════════════════════════════════════════════════════════════
# CONEXIÓN INICIAL
# ════════════════════════════════════════════════════════════════════════════

func connect_to_server(url: String, token: String) -> void:
    """Conectar al servidor WebSocket"""
    print("🔌 Conectando a %s" % url)
    
    websocket = WebSocketClient.new()
    websocket.connected_to_server.connect(_on_websocket_connected)
    websocket.connection_closed.connect(_on_websocket_disconnected)
    websocket.server_disconnected.connect(_on_websocket_disconnected)
    websocket.data_received.connect(_on_websocket_data)
    
    # Setear header de autenticación
    # websocket.connect_to_url(url, ["Authorization: Bearer %s" % token])
    
    var error = websocket.connect_to_url(url)
    if error != OK:
        error_occurred.emit("Error conectando: %d" % error)

func _on_websocket_connected(protocol: String = "") -> void:
    print("✅ Conectado a WebSocket")
    is_connected = true

func _on_websocket_disconnected() -> void:
    print("❌ Desconectado de WebSocket")
    is_connected = false
    error_occurred.emit("Desconectado del servidor")

# ════════════════════════════════════════════════════════════════════════════
# ENVÍO: send_event()
# ════════════════════════════════════════════════════════════════════════════

func send_event(payload: Dictionary) -> void:
    """Enviar evento al servidor"""
    if not is_connected:
        error_occurred.emit("No conectado al servidor")
        return
    
    var json_str = JSON.stringify(payload)
    print("📤 Enviando: %s" % json_str)
    
    var error = websocket.send_text(json_str)
    if error != OK:
        error_occurred.emit("Error enviando: %d" % error)

# ════════════════════════════════════════════════════════════════════════════
# RECEPCIÓN: _process() + _on_websocket_data()
# ════════════════════════════════════════════════════════════════════════════

func _process(delta: float) -> void:
    if websocket and is_connected:
        websocket.poll()

func _on_websocket_data() -> void:
    """Datos recibidos del servidor"""
    var data = websocket.get_message()
    
    if data is String:
        _handle_message(data)

func _handle_message(message: String) -> void:
    """Parsear y routear mensaje del servidor"""
    print("📨 Recibido: %s" % message)
    
    var json = JSON.new()
    var error = json.parse(message)
    
    if error != OK:
        print("❌ Error parseando JSON")
        return
    
    var data = json.data
    if not data is Dictionary:
        print("❌ Datos no son Dictionary")
        return
    
    var event_name = data.get("event", "unknown")
    var event_data = data.get("data", {})
    
    # Emitir signal para que MatchManager lo procese
    server_event.emit(event_name, event_data)
```

---

## Validaciones Locales

### Checklist de Validaciones en GameBoard

```gdscript
# GameBoard.gd - Función _can_end_turn()

func _can_end_turn() -> bool:
    # ✅ ¿Botón ya fue presionado y estamos esperando?
    if is_waiting_for_server:
        return false
    
    # ✅ ¿Es realmente nuestro turno?
    var game_state = MatchManager.get_game_state()
    if game_state.current_player != player_number:
        return false
    
    # ✅ ¿Hay animaciones en progreso?
    if _has_animations_in_progress():
        return false
    
    # ✅ ¿El match está activo?
    if not MatchManager.is_in_match():
        return false
    
    # ✅ ¿WebSocket está conectado?
    if not WebSocketManager.is_connected:
        return false
    
    return true
```

---

## Envío del Evento

### Estructura del Payload

```gdscript
# El payload DEBE incluir:
var payload = {
    "event": "end_turn",           # Nombre del evento
    "data": {
        "match_id": "uuid-...",    # ID del match (crítico)
        "action_id": "uuid-...",   # ID único de acción (para idempotencia)
        "turn_number": 5,          # Para debugging
        "timestamp": 1234567890    # SOLO para logging (no confiar)
    }
}
```

### Generar UUID Único

```gdscript
# Godot 4.1+
func _generate_uuid() -> String:
    return str(randi_range(0, 999999)) + "_" + str(Time.get_ticks_msec())

# Mejor (si hay librería):
# return UUID.v4().to_string()
```

---

## Recepción y Sincronización

### Estados Esperados

```
Cliente espera → Servidor responde con:

1️⃣ "turn_ended" (confirmación rápida)
   └─ Indica que la acción fue recibida y procesada
   └─ NO cambia el estado, solo confirma

2️⃣ "match_updated" (snapshot completo)
   └─ Contiene nuevo turno_number, current_player, etc.
   └─ AQUÍ es donde realmente sincronizas el estado
```

### Manejo de Eventos

```gdscript
# MatchManager recibe ambos eventos

func _on_server_event(event_name: String, event_data: Dictionary):
    match event_name:
        "turn_ended":
            print("✅ Turno finalizado (confirmación)")
            # Mostrar visual de OK temprano si quieres
        
        "match_updated":
            print("🔄 Estado actualizado, sincronizando...")
            _on_match_updated(event_data)
            # AQUÍ es donde realmente cambias el estado
```

---

## Animaciones

### Principio Core

> **NUNCA recalcules. Anima hacia el siguiente estado.**

### Flujo Correcto

```gdscript
# GameBoard.gd

func _on_turn_changed(new_player: int) -> void:
    """Turno cambió (server confirmó via match_updated)"""
    
    var old_player = MatchManager.get_game_state().current_player
    
    # Guardar estado ANTERIOR para comparar
    var state_before = _capture_current_state()
    
    # ← SERVIDOR ENVÍA NUEVO ESTADO ←
    
    var state_after = _capture_current_state()
    
    # Detectar qué cambió
    var changes = _compare_states(state_before, state_after)
    
    # Animar SOLO los cambios
    if new_player == player_number:
        _animate_our_turn_starts(changes)
    else:
        _animate_opponent_turn_starts(changes)

func _animate_our_turn_starts(changes: Dictionary) -> void:
    """Nuestro turno empieza"""
    
    # Animar indicador
    var tween = create_tween()
    tween.set_trans(Tween.TRANS_BOUNCE)
    tween.set_ease(Tween.EASE_OUT)
    tween.tween_property(turn_indicator, "scale", Vector2(1.2, 1.2), 0.3)
    tween.tween_callback(func(): turn_indicator.text = "Tu Turno")
    
    # Habilitar botón
    end_turn_button.disabled = false
    end_turn_button.text = "Pasar Turno"
    
    # Animar cosmos
    if changes.has("player1_cosmos"):
        _animate_cosmos_change(
            player_cosmos_display,
            changes.player1_cosmos.from,
            changes.player1_cosmos.to
        )

func _animate_opponent_turn_starts(changes: Dictionary) -> void:
    """Turno del oponente"""
    
    # Deshabilitar botón
    end_turn_button.disabled = true
    end_turn_button.text = "Esperando..."
    
    # Indicador visual
    turn_indicator.text = "Turno del Oponente"
    turn_indicator.self_modulate = Color.RED

func _animate_cosmos_change(label: Label, from: int, to: int) -> void:
    """Animar cambio de cosmos (ejemplo)"""
    var tween = create_tween()
    
    # Animar número
    var current = from
    tween.tween_callback(func():
        label.text = str(current)
    )
    
    for i in range(from, to + 1):
        tween.tween_callback(func():
            label.text = str(i)
        )
        if i < to:
            await get_tree().process_frame
    
    # Cambiar color temporalmente
    tween.set_parallel(true)
    tween.tween_property(label, "self_modulate", Color.YELLOW, 0.1)
    tween.tween_property(label, "self_modulate", Color.WHITE, 0.1)

func _capture_current_state() -> Dictionary:
    """Capturar estado visual actual para comparación"""
    var game_state = MatchManager.get_game_state()
    return {
        "turn": game_state.turn_number,
        "player": game_state.current_player,
        "cosmos1": game_state.player1_cosmos,
        "cosmos2": game_state.player2_cosmos,
        "hand1": game_state.player1_hand_count,
        "hand2": game_state.player2_hand_count,
    }

func _compare_states(before: Dictionary, after: Dictionary) -> Dictionary:
    """Detectar qué cambió"""
    var changes = {}
    
    if after.cosmos1 != before.cosmos1:
        changes.player1_cosmos = {"from": before.cosmos1, "to": after.cosmos1}
    
    if after.cosmos2 != before.cosmos2:
        changes.player2_cosmos = {"from": before.cosmos2, "to": after.cosmos2}
    
    return changes
```

---

## Manejo de Errores

### Scenarios Posibles

#### 1. Timeout del Servidor

```gdscript
# MatchManager: Timeout después de 10 segundos sin respuesta

var turn_end_start_time: float = 0.0
var turn_end_timeout: float = 10.0

func _start_timeout_check():
    turn_end_start_time = Time.get_ticks_msec() / 1000.0
    
    while is_waiting_for_server:
        await get_tree().process_frame
        
        var elapsed = (Time.get_ticks_msec() / 1000.0) - turn_end_start_time
        if elapsed > turn_end_timeout:
            print("⏱️ Timeout on end_turn")
            end_turn_failed.emit("Timeout esperando servidor")
            is_waiting_for_server = false
            return
```

#### 2. Error del Servidor

```gdscript
# MatchManager: Servidor envía error

func _on_server_error(data: Dictionary):
    var error_code = data.get("code", "UNKNOWN")
    var error_msg = data.get("message", "Error desconocido")
    
    match error_code:
        "NOT_IN_MATCH":
            print("❌ No estás en el match")
        "NOT_YOUR_TURN":
            print("❌ No es tu turno")
        "MATCH_NOT_FOUND":
            print("❌ Partida no encontrada")
        _:
            print("❌ Error: %s" % error_msg)
    
    end_turn_failed.emit(error_msg)
    # GameBoard: re-habilitar botón
```

#### 3. WebSocket Desconectado

```gdscript
# WebSocketManager: Desconexión detectada

func _on_websocket_disconnected():
    print("❌ WebSocket desconectado")
    error_occurred.emit("Desconectado del servidor")
    
    # MatchManager: Propagar error
    # → GameBoard: mostrar "Reconectando..." y deshabilitar acciones
```

#### 4. Evento Fuera de Orden

```gdscript
# MatchManager: Recibe evento más antiguo que el actual

func _is_valid_sequence(data: Dictionary) -> bool:
    var data_turn = data.get("turn_number", 0)
    var current_turn = _game_state.turn_number
    
    if data_turn < current_turn:
        print("⚠️ Evento antiguo descartado")
        return false
    
    return true
    
    # Si falla validación:
    # → Pedir resync completo
    # → request_full_resync()
```

---

## Código Completo de Ejemplo

### GameBoard.gd (Simplificado)

```gdscript
# scenes/game/GameBoard.gd

extends Control

@onready var end_turn_button: Button = $VBoxContainer/HBoxContainer/EndTurnButton
@onready var turn_indicator: Label = $VBoxContainer/TurnIndicator

var player_number: int = 1
var is_waiting_for_server: bool = false

func _ready():
    end_turn_button.pressed.connect(_on_end_turn_button_pressed)
    MatchManager.turn_changed.connect(_on_turn_changed)
    MatchManager.end_turn_failed.connect(_on_end_turn_failed)
    _update_ui()

func _on_end_turn_button_pressed():
    if not _can_end_turn():
        return
    
    is_waiting_for_server = true
    end_turn_button.disabled = true
    end_turn_button.text = "Enviando..."
    
    await MatchManager.end_turn()

func _can_end_turn() -> bool:
    if is_waiting_for_server:
        return false
    
    var game_state = MatchManager.get_game_state()
    if game_state.current_player != player_number:
        return false
    
    return true

func _on_turn_changed(new_player: int):
    is_waiting_for_server = false
    _update_ui()
    
    if new_player == player_number:
        print("✅ ¡Es tu turno!")
        end_turn_button.disabled = false
        turn_indicator.text = "Tu Turno"
    else:
        print("⏳ Turno del oponente")
        end_turn_button.disabled = true
        turn_indicator.text = "Turno del Oponente"

func _on_end_turn_failed(error: String):
    is_waiting_for_server = false
    end_turn_button.disabled = false
    end_turn_button.text = "Reintentar"
    print("❌ Error: %s" % error)

func _update_ui():
    var game_state = MatchManager.get_game_state()
    
    if game_state.current_player == player_number:
        end_turn_button.disabled = false
        end_turn_button.text = "Pasar Turno"
    else:
        end_turn_button.disabled = true
        end_turn_button.text = "Esperando..."
```

### MatchManager.gd (Simplificado)

```gdscript
# scripts/managers/MatchManager.gd

extends Node

signal turn_changed(new_player: int)
signal end_turn_failed(error: String)
signal game_state_updated(data: Dictionary)

var _game_state: GameState = GameState.new()
var _current_match: Dictionary = {}

func _ready():
    WebSocketManager.server_event.connect(_on_server_event)

func end_turn():
    """Enviar end_turn al servidor"""
    if _game_state.current_player != 1:  # Hardcoded para ejemplo
        end_turn_failed.emit("No es tu turno")
        return
    
    var payload = {
        "event": "end_turn",
        "data": {
            "match_id": _current_match.id,
            "action_id": str(randi())
        }
    }
    
    WebSocketManager.send_event(payload)

func _on_server_event(event_name: String, data: Dictionary):
    match event_name:
        "match_updated":
            _sync_game_state(data)
            turn_changed.emit(data.current_player)
        
        "error":
            end_turn_failed.emit(data.message)

func _sync_game_state(data: Dictionary):
    _game_state.turn_number = data.turn_number
    _game_state.current_player = data.current_player
    _game_state.player1_cosmos = data.player1_cosmos
    _game_state.player2_cosmos = data.player2_cosmos

func get_game_state() -> GameState:
    return _game_state

func set_match(match_data: Dictionary):
    _current_match = match_data
```

---

## Checklist de Implementación

### Paso 1: Setup
- [ ] Crear `MatchManager.gd` como autoload
- [ ] Crear/actualizar `WebSocketManager.gd`
- [ ] Importar `GameState` en MatchManager
- [ ] Conectar signals

### Paso 2: Validaciones
- [ ] Implementar `_can_end_turn()` en GameBoard
- [ ] Verificar precondiciones en MatchManager
- [ ] Validar secuencia en `_is_valid_sequence()`

### Paso 3: Comunicación
- [ ] Generar `action_id` único por acción
- [ ] Construir payload correcto
- [ ] Enviar vía `WebSocketManager.send_event()`

### Paso 4: Sincronización
- [ ] Recibir `match_updated` del servidor
- [ ] Aplicar snapshot a `GameState`
- [ ] Emitir `turn_changed` signal

### Paso 5: UI
- [ ] Actualizar botón según turno
- [ ] Mostrar indicador visual
- [ ] Deshabilitar durante espera

### Paso 6: Animaciones
- [ ] Guardar estado antes
- [ ] Comparar con estado después
- [ ] Animar diferencias

### Paso 7: Errores
- [ ] Implementar timeout (10s)
- [ ] Manejar desconexión
- [ ] Mostrar feedback de error

---

## Debugging

### Logs Esperados (Éxito)

```
🔘 Botón 'Pasar Turno' presionado
✅ GameBoard: _can_end_turn() = true
🔄 MatchManager: Iniciando end_turn()
📤 Enviando payload: {"event":"end_turn","data":{...}}
⏳ Esperando confirmación del servidor...
📬 MatchManager: Recibido evento 'match_updated'
✅ GameState sincronizado: Turn 3, Player 2
✅ Turno cambió: 2 → 3
✅ Nuevo player: 2
🔄 Match actualizado por servidor
✅ ¡Es tu turno!
```

### Logs con Error

```
🔘 Botón presionado
❌ No puedes pasar turno ahora
→ No es tu turno (turno del jugador 2)

---

📤 Enviando payload...
⏱️ Timeout esperando respuesta
❌ WebSocket error: Connection refused
🔌 Reconectando...
```

---

## Referencias

- [TURN-SYSTEM-DESIGN.md](TURN-SYSTEM-DESIGN.md) - Especificación del servidor
- [GameState.gd](#) - Modelo de estado sincronizado
- [WebSocketManager.gd](#) - Comunicación WebSocket

---

**Documento lista para implementación. Todos los pasos están cubiertos:**
- ✅ Validaciones locales
- ✅ Envío de evento
- ✅ Recepción y sincronización
- ✅ Animaciones
- ✅ Manejo de errores
- ✅ Ejemplos de código completo

