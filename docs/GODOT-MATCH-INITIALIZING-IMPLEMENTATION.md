# Cambios en Cliente Godot para Manejar 'match_initializing'

**Guía de implementación del nuevo evento de inicialización de partida**

---

## Cambios Requeridos

### 1. MatchManager.gd - Agregar Signal

```gdscript
# scripts/managers/MatchManager.gd

extends Node

# ════════════════════════════════════════════════════════════════════════════
# SIGNALS (Actualizado)
# ════════════════════════════════════════════════════════════════════════════

signal turn_changed(new_player: int)
signal game_state_updated(data: Dictionary)
signal match_searching()                          # Ya existe
signal match_initializing(data: Dictionary)       # ⭐ NUEVO
signal match_found(data: Dictionary)              # ⭐ RENOMBRAR si no existe
signal match_ended(result: Dictionary)            # Para cuando termine
```

---

### 2. MatchManager.gd - Manejar nuevo evento

```gdscript
# scripts/managers/MatchManager.gd

func _on_server_event(event_name: String, event_data: Dictionary) -> void:
    """Recibe eventos del servidor vía WebSocketManager"""
    
    print("📬 MatchManager: Recibió evento '%s'" % event_name)
    
    match event_name:
        "searching":
            # Phase transitions to 'waiting'
            _on_searching(event_data)
        
        "match_initializing":
            # ⭐ NUEVO: Phase es 'starting' - juego se prepara
            _on_match_initializing(event_data)
        
        "match_found":
            # Phase es 'player1_turn' o 'player2_turn' - listo para jugar
            _on_match_found(event_data)
        
        "match_ended":
            _on_match_ended(event_data)
        
        "error":
            _on_server_error(event_data)

func _on_searching(data: Dictionary) -> void:
    """
    Servidor confirmó: Buscando rival (Match en 'waiting')
    """
    print("⏳ Buscando rival...")
    _current_match_id = data.get("match_id", "")
    
    # Emitir signal para que GameBoard/UI reaccione
    match_searching.emit()

func _on_match_initializing(data: Dictionary) -> void:
    """
    ⭐ NUEVO: Match pasó a 'starting'
    - Player 2 se unió
    - Cartas se están cargando
    - Cliente debe mostrar pantalla de carga
    """
    print("🎮 Inicializando juego (phase: starting)...")
    
    var phase = data.get("phase", "starting")
    var message = data.get("message", "Inicializando...")
    
    print("   Mensaje: %s" % message)
    
    # Emitir signal para que GameBoard muestre efecto de carga
    match_initializing.emit(data)

func _on_match_found(data: Dictionary) -> void:
    """
    Match listo para jugar (phase: 'player1_turn' o 'player2_turn')
    - Ambas cartas cargadas
    - Turnos decididos
    - Estado completo disponible
    """
    print("✅ Partida encontrada (phase: %s)" % data.get("phase", "unknown"))
    
    # Guardar datos
    _current_match = data
    _sync_game_state(data)
    
    # Emitir signals
    match_found.emit(data)
    
    # Turno cambió
    var new_player = data.get("current_player", 1)
    turn_changed.emit(new_player)
    
    print("   Current player: %d" % new_player)

func _on_match_ended(data: Dictionary) -> void:
    """Match terminó"""
    print("🏆 Partida terminada")
    match_ended.emit(data)
```

---

### 3. GameBoard.gd - UI para 'match_initializing'

```gdscript
# scenes/game/GameBoard.gd

extends Control

# ════════════════════════════════════════════════════════════════════════════
# REFERENCIAS A NODOS
# ════════════════════════════════════════════════════════════════════════════

@onready var loading_screen: Control = $LoadingScreen    # Crear o usar existente
@onready var loading_label: Label = $LoadingScreen/Label
@onready var loading_spinner: Control = $LoadingScreen/Spinner

@onready var end_turn_button: Button = $VBoxContainer/EndTurnButton
@onready var turn_indicator: Label = $TurnIndicator

# ════════════════════════════════════════════════════════════════════════════
# STATE
# ════════════════════════════════════════════════════════════════════════════

var player_number: int = 1
var is_match_initializing: bool = false
var is_match_found: bool = false

# ════════════════════════════════════════════════════════════════════════════
# LIFECYCLE
# ════════════════════════════════════════════════════════════════════════════

func _ready():
    # Conectar signals de MatchManager
    MatchManager.match_searching.connect(_on_match_searching)
    MatchManager.match_initializing.connect(_on_match_initializing)           # ⭐ NUEVO
    MatchManager.match_found.connect(_on_match_found)
    MatchManager.match_ended.connect(_on_match_ended)
    MatchManager.turn_changed.connect(_on_turn_changed)
    
    end_turn_button.pressed.connect(_on_end_turn_button_pressed)
    
    # Inicialmente oculto (mostrar cuando empiece matchmaking)
    loading_screen.hide()
    
    _update_ui()

# ════════════════════════════════════════════════════════════════════════════
# EVENTS DESDE MATCHMANAGER
# ════════════════════════════════════════════════════════════════════════════

func _on_match_searching():
    """
    Buscando rival (Match en 'waiting')
    Mostrar: "Buscando rival..."
    """
    print("🔍 GameBoard: Mostrar pantalla de búsqueda")
    
    is_match_initializing = false
    is_match_found = false
    
    # Mostrar pantalla de loading
    _show_loading_screen("Buscando rival...", with_spinner=true)

func _on_match_initializing(data: Dictionary):
    """
    ⭐ NUEVO: Juego se está preparando (Match en 'starting')
    Mostrar: "Inicializando juego..."
    """
    print("🎮 GameBoard: Inicializando juego")
    
    is_match_initializing = true
    is_match_found = false
    
    var message = data.get("message", "Inicializando juego...")
    
    # Actualizar pantalla de carga
    _show_loading_screen(message, with_spinner=true)
    
    # Efecto visual (opcional)
    _play_init_animation()
    
    # Sonido (opcional)
    if AudioManager:
        AudioManager.play("sfx_game_initializing")

func _on_match_found(data: Dictionary):
    """
    ✅ Partida lista para jugar (Match en 'player1_turn' o 'player2_turn')
    El juego está completamente cargado
    """
    print("✅ GameBoard: Partida encontrada")
    
    is_match_initializing = false
    is_match_found = true
    
    # Ocultar pantalla de carga (con fade out opcional)
    _hide_loading_screen(fade_out=true)
    
    # Renderizar el juego
    _render_game_board(data)
    
    # Audio: reproducir intro de batalla
    if AudioManager:
        AudioManager.play("music_battle")

func _on_match_ended(result: Dictionary):
    """Partida terminó"""
    print("🏆 GameBoard: Partida terminada")
    
    is_match_found = false
    
    _show_match_result(result)

func _on_turn_changed(new_player: int):
    """Turno cambió"""
    print("🔄 GameBoard: Turno cambió a Player %d" % new_player)
    
    _update_ui()
    _animate_turn_change(new_player)

# ════════════════════════════════════════════════════════════════════════════
# UI HELPERS
# ════════════════════════════════════════════════════════════════════════════

func _show_loading_screen(message: String, with_spinner: bool = true):
    """Mostrar pantalla de carga con mensaje"""
    loading_label.text = message
    
    if with_spinner and loading_spinner:
        loading_spinner.show()
        _start_spinner_animation()
    
    loading_screen.show()
    
    # Fade in (opcional)
    var tween = create_tween()
    tween.tween_property(loading_screen, "modulate", Color.WHITE, 0.3)

func _hide_loading_screen(fade_out: bool = true):
    """Ocultar pantalla de carga"""
    if fade_out:
        var tween = create_tween()
        tween.tween_property(loading_screen, "modulate", Color.WHITE, 0.5)
        tween.tween_property(loading_screen, "modulate", Color.TRANSPARENT, 0.2)
        tween.tween_callback(func(): loading_screen.hide())
    else:
        loading_screen.hide()

func _start_spinner_animation():
    """Animar spinner mientras carga"""
    if loading_spinner:
        var tween = create_tween()
        tween.set_loops()  # Loop infinito
        tween.tween_property(loading_spinner, "rotation", PI * 2, 1.0)

func _play_init_animation():
    """Animación visual cuando empieza el game"""
    # Ejemplo: Flash de pantalla, sonido, etc.
    pass

func _render_game_board(data: Dictionary):
    """Renderizar el tablero con los datos recibidos"""
    # Aquí renderizar cartas, estado, etc.
    # Es el mismo código que ya tienen
    pass

func _show_match_result(result: Dictionary):
    """Mostrar resultado de la partida"""
    var winner = result.get("winner", "unknown")
    _show_loading_screen("¡%s gana!" % winner)

func _animate_turn_change(new_player: int):
    """Animar indicador de turno"""
    var game_state = MatchManager.get_game_state()
    
    if new_player == player_number:
        turn_indicator.text = "Tu Turno"
        turn_indicator.self_modulate = Color.GREEN
        
        # Animación
        var tween = create_tween()
        tween.tween_property(turn_indicator, "scale", Vector2(1.2, 1.2), 0.2)
        tween.tween_property(turn_indicator, "scale", Vector2(1.0, 1.0), 0.1)
    else:
        turn_indicator.text = "Turno del Oponente"
        turn_indicator.self_modulate = Color.RED

func _update_ui():
    """Actualizar estado de botones y UI general"""
    if not is_match_found:
        end_turn_button.disabled = true
        end_turn_button.text = "Esperando..."
        return
    
    var game_state = MatchManager.get_game_state()
    
    if game_state.current_player == player_number:
        end_turn_button.disabled = false
        end_turn_button.text = "Pasar Turno"
    else:
        end_turn_button.disabled = true
        end_turn_button.text = "Esperando..."

func _on_end_turn_button_pressed():
    """Usuario presiona 'Pasar Turno'"""
    if not is_match_found:
        return
    
    # ... código existente para end_turn ...
    await MatchManager.end_turn()
```

---

## Escena en Godot: LoadingScreen (si no existe)

Si no tienes una escena de loading, crea una simple:

```
LoadingScreen (Control)
├── ColorRect (fondo semi-transparente)
│   ├── color: Color(0, 0, 0, 0.7)
│   ├── anchors: Full Rect
├── VBoxContainer (centrado)
│   ├── Label (mensaje)
│   │   ├── text: "Inicializando..."
│   │   ├── custom_fonts: title_font
│   │   ├── alignment: CENTER
│   └── Spinner (Control o AnimatedSprite2D)
│       ├── animation: rotation_spinner
```

Alternativamente, usa un GIF o animación sprite para el spinner.

---

## Timeline Visual en el Cliente

```
ANTES (❌ Salto abrupto):
┌─────────────────────┐
│ Buscando rival...   │  ← Esperando Player 2
│     [spinner]       │
└─────────────────────┘
         ↓ (pausa)
┌─────────────────────┐
│  ¡Partida lista!    │  ← De repente aparece el tablero
│ [Cartas visibles]   │
│  Tu turno (o no)    │
└─────────────────────┘

DESPUÉS (✅ Transición clara):
┌─────────────────────┐
│ Buscando rival...   │  ← Esperando Player 2
│     [spinner]       │
└─────────────────────┘
         ↓ (Player 2 se une)
┌─────────────────────┐
│ Inicializando...    │  ← ⭐ NUEVO: Fase visible
│     [spinner]       │
└─────────────────────┘
         ↓ (1-2 segundos)
┌─────────────────────┐
│  ¡Partida lista!    │  ← Transición suave
│ [Cartas visibles]   │
│  Tu turno (o no)    │
└─────────────────────┘
```

---

## Checklist de Implementación

- [ ] **MatchManager.gd**
  - [ ] Agregar signal `match_initializing`
  - [ ] Agregar función `_on_server_event` actualizada
  - [ ] Agregar función `_on_match_initializing`
  - [ ] Verificar que `_on_match_found` y otros eventos funcionan

- [ ] **GameBoard.gd** (o tu pantalla principal)
  - [ ] Conectar signal `match_initializing`
  - [ ] Agregar función `_on_match_initializing`
  - [ ] Agregar función `_show_loading_screen`
  - [ ] Agregar función `_hide_loading_screen`
  - [ ] Probar fade in/out

- [ ] **Escena LoadingScreen**
  - [ ] Crear si no existe
  - [ ] Label con mensaje
  - [ ] Spinner/AnimatedSprite
  - [ ] ColorRect de fondo

- [ ] **Testing**
  - [ ] Buscar rival → ver "Buscando rival..."
  - [ ] Player 2 se une → ver "Inicializando..."
  - [ ] Transición a "Partida lista" es suave
  - [ ] Audio/animaciones se sincro

nizan

---

## Debugging

### Si no ves 'match_initializing':
```gdscript
# En MatchManager._on_server_event():
print("DEBUG: Evento recibido: %s" % event_name)

# Verificar que WebSocketManager lo envía
# En WebSocketManager: print() cuando recibe 'match_initializing'
```

### Si LoadingScreen no desaparece:
```gdscript
# Verificar que _hide_loading_screen() se llama
func _on_match_found(data: Dictionary):
    print("DEBUG: _on_match_found called")
    _hide_loading_screen(fade_out=true)
```

### Si faltan eventos:
```gdscript
# En WebSocketManager, verifica que emite signals:
func _handle_message(message: String):
    # ...
    print("DEBUG: Emitiendo signal '%s'" % event_name)
    server_event.emit(event_name, event_data)
```

---

## Resumen de Cambios

| Componente | Cambio |
|-----------|--------|
| **Servidor** | Agrega evento `'match_initializing'` antes de `'match_found'` |
| **MatchManager** | Agrega signal `match_initializing` y handler |
| **GameBoard** | Agrega `_on_match_initializing()` para mostrar carga |
| **LoadingScreen** | Crea o actualiza con fade in/out |

**Resultado**: ✅ Transición suave y visualización clara de que algo está pasando

