# Comparación Lado a Lado: Framework vs Nuestro Código

---

## 1. INPUT HANDLING - EL PROBLEMA

### ❌ NUESTRO CÓDIGO (CardDisplay.gd)

```gdscript
# Líneas 45-51: Mouse connections sin protección
func _ready() -> void:
    mouse_entered.connect(play_hover_animation)
    mouse_exited.connect(stop_hover_animation)

func _on_gui_input(event: InputEventMouseButton) -> void:
    if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        card_clicked.emit(self)  # ❌ Sin validación
        drag_started.emit(self)  # ❌ Se emite inmediatamente
```

**Problemas:**
1. ✗ Ambos signals se emiten en el mismo evento
2. ✗ No se valida si la card está animando
3. ✗ Si 2 cards están superpuestos, ambos responden
4. ✗ No diferencia entre click y drag
5. ✗ No coordina con otras cards en el tablero

---

### ✅ FRAMEWORK (CardTemplate.gd línea 445+)

```gdscript
# Línea 45-47
func _ready() -> void:
    # Control node connections
    $Control.connect("gui_input", Callable(self, "_on_Card_gui_input"))
    $Control.connect("tree_exiting", Callable(self, "_on_tree_exiting"))

# Línea 445-521
func _on_Card_gui_input(event) -> void:
    if event is InputEventMouseButton and cfc.NMAP.has("board"):
        # ✅ PASO 1: Validar si otra card tiene prioridad
        if cfc.NMAP.board.mouse_pointer.current_focused_card \
                and self != cfc.NMAP.board.mouse_pointer.current_focused_card:
            cfc.NMAP.board.mouse_pointer.current_focused_card._on_Card_gui_input(event)
        
        # ✅ PASO 2: Validar que es click izquierdo Y estado válido
        elif event.is_pressed() \
                and event.get_button_index() == 1 \
                and not buttons.are_hovered() \
                and not tokens.are_hovered():
            
            # ✅ PASO 3: Diferencia click vs drag
            if event.doubleclick:
                execute_scripts()
            else:
                # ✅ PASO 4: Valida estado antes de permitir drag
                if state in [CardState.FOCUSED_IN_HAND,
                        CardState.FOCUSED_ON_BOARD,
                        CardState.FOCUSED_IN_POPUP]:
                    
                    # ✅ PASO 5: Usa await + global flag para long-press
                    cfc.card_drag_ongoing = self
                    await get_tree().create_timer(0.1).timeout
                    
                    # ✅ PASO 6: Si sigue presionado, inicia drag
                    if cfc.card_drag_ongoing == self:
                        if state == CardState.FOCUSED_IN_HAND \
                                and (disable_dragging_from_hand \
                                or check_play_costs() == CFConst.CostsState.IMPOSSIBLE):
                            cfc.card_drag_ongoing = null
                        else:
                            _start_dragging(event.position)
        
        # ✅ PASO 7: Mouse release
        elif not event.is_pressed() and event.get_button_index() == 1:
            cfc.card_drag_ongoing = null
            match state:
                CardState.DRAGGED:
                    z_index = 0
                    move_to(cfc.NMAP.board)
```

**Ventajas:**
1. ✓ Input prioritization (solo el card "de arriba" responde)
2. ✓ Validación de estado (no puede arrastrar si está animando)
3. ✓ Long-press detection (diferencia click vs drag)
4. ✓ Global coordination (flag `card_drag_ongoing`)
5. ✓ Double-click support
6. ✓ Cost validation antes de permitir drag

---

## 2. MOUSE ENTERED/EXITED - FOCUS MANAGEMENT

### ❌ NUESTRO CÓDIGO

```gdscript
func play_hover_animation() -> void:
    _tween.tween_property(self, "scale", Vector2(1.1, 1.1), 0.15) \
        .set_ease(Tween.EASE_OUT) \
        .set_trans(Tween.TRANS_CUBIC)

func stop_hover_animation() -> void:
    _tween.tween_property(self, "scale", Vector2(1.0, 1.0), 0.15) \
        .set_ease(Tween.EASE_OUT) \
        .set_trans(Tween.TRANS_CUBIC)

# Problema: Se anima aunque esté siendo arrastrada
# Problema: No hay validación de estado
```

---

### ✅ FRAMEWORK

```gdscript
# Línea 410-424
func _on_Card_mouse_entered() -> void:
    # ✅ Solo animar si está en estado válido
    match state:
        CardState.IN_HAND, CardState.REORGANIZING, CardState.PUSHED_ASIDE:
            if not cfc.card_drag_ongoing:  # ✅ Si NO se está arrastrando otra
                interruptTweening()  # ✅ Cancelar tweens previos
                set_state(CardState.FOCUSED_IN_HAND)  # ✅ Cambiar estado
        CardState.ON_PLAY_BOARD:
            set_state(CardState.FOCUSED_ON_BOARD)
        CardState.IN_POPUP:
            set_state(CardState.FOCUSED_IN_POPUP)

func _on_Card_mouse_exited() -> void:
    # ✅ Revertir cambios según estado previo
    match state:
        CardState.FOCUSED_IN_HAND:
            if get_parent().is_in_group("hands"):
                for c in get_parent().get_all_cards():
                    c.interruptTweening()
                    c.reorganize_self()  # ✅ Reacomodar mano
```

**Ventajas:**
1. ✓ Valida estado antes de animar
2. ✓ Coordina con global drag flag
3. ✓ Interrumpe tweens previos
4. ✓ Reorganiza mano al salir del hover
5. ✓ Comportamiento distinto por ubicación (hand vs board)

---

## 3. STATE MACHINE - EL CORAZÓN DEL SISTEMA

### ❌ NUESTRO CÓDIGO

```gdscript
# No tenemos estados explícitos
# Solo variables boolean:
var is_focused: bool = false
var is_dragging: bool = false
var is_in_hand: bool = true

# Esto es frágil:
# - Qué pasa si is_focused=true Y is_dragging=true?
# - No hay un "punto de verdad único"
# - Difícil de debuggear
```

---

### ✅ FRAMEWORK

```gdscript
# Línea 12-30
enum CardState {
    IN_HAND                    # 0
    FOCUSED_IN_HAND           # 1
    MOVING_TO_CONTAINER       # 2
    REORGANIZING              # 3
    PUSHED_ASIDE              # 4
    DRAGGED                   # 5
    DROPPING_TO_BOARD         # 6
    ON_PLAY_BOARD             # 7
    FOCUSED_ON_BOARD          # 8
    IN_PILE                   # 9
    VIEWED_IN_PILE            # 10
    IN_POPUP                  # 11
    FOCUSED_IN_POPUP          # 12
    VIEWPORT_FOCUS            # 13
    PREVIEW                   # 14
    DECKBUILDER_GRID          # 15
    MOVING_TO_SPAWN_DESTINATION # 16
}

var state: int = CardState.PREVIEW: set = set_state

func set_state(value: int) -> void:
    if state == value:
        return
    var prev_state = state
    state = value
    # ✅ Emitir signal para que otros reaccionen
    emit_signal("state_changed", self, prev_state, state)
```

**Ventajas:**
1. ✓ Un único "punto de verdad"
2. ✓ Estados mutuamente excluyentes
3. ✓ Fácil de debuggear (print(state))
4. ✓ Emite signals cuando cambia
5. ✓ Control granular en `_process()`

---

## 4. PROCESS-BASED LOGIC - ANIMACIONES COORDINADAS

### ❌ NUESTRO CÓDIGO

```gdscript
func _process(_delta: float) -> void:
    # Nada, todo se anima con tweens
    pass

# Las animaciones se inician al momento:
# - No hay control sobre su duración
# - No se pueden interrumpir fácilmente
# - La lógica está esparcida en múltiples funciones
```

---

### ✅ FRAMEWORK

```gdscript
# Línea 369-400+
func _process(delta) -> void:
    _process_card_state()  # ← La lógica principal aquí

func _process_card_state() -> void:
    match state:
        CardState.IN_HAND:
            # No hacer nada
            pass
        
        CardState.FOCUSED_IN_HAND:
            # ✅ Animar cuando entra en este estado
            if not _focus_completed:
                _add_tween_scale(scale, Vector2(1.1, 1.1), 0.3)
                _focus_completed = true
        
        CardState.REORGANIZING:
            # ✅ Animar hacia posición final
            if not $Tween.is_active():
                _add_tween_position(position, _target_position, 0.4)
        
        CardState.DRAGGED:
            # ✅ Seguir el mouse continuamente
            position = cfc.NMAP.board.mouse_pointer.determine_global_mouse_pos() - _drag_offset
        
        CardState.DROPPING_TO_BOARD:
            # ✅ Animar al tablero
            if not $Tween.is_active():
                _add_tween_position(position, _target_position, 0.25)
```

**Ventajas:**
1. ✓ Toda la lógica en un lugar
2. ✓ Control granular por estado
3. ✓ Fácil de cambiar comportamiento
4. ✓ Pueden usarse variables `_is_animating`, `_focus_completed`
5. ✓ Coordina con el estado actual

---

## 5. DRAG COORDINATION - GLOBAL FLAG

### ❌ NUESTRO CÓDIGO

```gdscript
# No hay coordinación global
# Si 2 cards están superpuestos:
# - Ambos pueden iniciarse arrastrando
# - No hay forma de saber quién "ganó"
# - Comportamiento indefinido
```

---

### ✅ FRAMEWORK

```gdscript
# En un singleton (cfc):
var card_drag_ongoing: Card = null

# En el card durante input:
if state in [CardState.FOCUSED_IN_HAND, CardState.FOCUSED_ON_BOARD]:
    # ✅ Marcar que THIS card va a intentar drag
    cfc.card_drag_ongoing = self
    
    await get_tree().create_timer(0.1).timeout
    
    # ✅ Verificar que no fue sobrescrito por otro card
    if cfc.card_drag_ongoing == self:
        _start_dragging(event.position)

# En otro card:
elif event.is_pressed() and event.get_button_index() == 1:
    # ✅ Si otro card ya está en drag, ignorar
    if cfc.card_drag_ongoing != null:
        return
```

**Ventajas:**
1. ✓ Solo un card se puede arrastrar a la vez
2. ✓ Primer card en long-press wins
3. ✓ No hay conflicto de prioridad
4. ✓ Fácil de debuggear

---

## 6. LONG-PRESS DETECTION

### ❌ NUESTRO CÓDIGO

```gdscript
# Se arrastra INMEDIATAMENTE al pressionar
func _get_drag_data(at_position: Vector2):
    return drag_data  # ← Al toque, ya se está arrastrando
```

**Problema:**
- Un click accidental inicia drag
- El usuario no puede hacer click sin mover la card
- Experiencia pobre

---

### ✅ FRAMEWORK

```gdscript
# Línea 490-501
else:
    if state in [CardState.FOCUSED_IN_HAND, CardState.FOCUSED_ON_BOARD]:
        # ✅ ESPERAR antes de iniciar drag
        cfc.card_drag_ongoing = self
        
        # ✅ Esperar 0.1 segundos - si se suelta, NO es drag
        await get_tree().create_timer(0.1).timeout
        
        # ✅ Si todavía estamos presionados:
        if cfc.card_drag_ongoing == self:
            _start_dragging(event.position)
```

**Ventajas:**
1. ✓ Click rápido no inicia drag
2. ✓ Mejor experiencia de usuario
3. ✓ Distingue intención del jugador
4. ✓ Permite double-click

---

## 7. SIGNAL PROPAGATION - ARCHITECTURE

### ❌ NUESTRO CÓDIGO

```gdscript
# Signals básicos:
signal card_clicked(card)
signal card_double_clicked(card)
signal drag_started(card)
signal drag_ended(card)

# ¿Pero qué otros sistemas reaccionan?
# No hay patrón claro
```

---

### ✅ FRAMEWORK

```gdscript
# Línea 101-121
signal card_rotated(card, trigger, details)
signal card_flipped(card, trigger, details)
signal card_moved_to_board(card, trigger, details)
signal card_moved_to_pile(card, trigger, details)
signal card_moved_to_hand(card, trigger, details)
signal card_token_modified(card, trigger, details)
signal card_attached(card, trigger, details)
signal card_unattached(card, trigger, details)
signal card_properties_modified(card, trigger, details)
signal card_targeted(card, trigger, details)
signal state_changed(card, old_state, new_state)
signal dragging_started(card)
signal scripts_executed(card, sceng, trigger)

# Hay un SignalPropagator singleton que escucha TODO
# Otros sistemas se suscriben y reaccionan

# Ejemplo de uso:
emit_signal("card_moved_to_board", self, "manual", 
    {"destination": "board", "source": "hand"})
```

**Ventajas:**
1. ✓ Signals estandarizados con trigger + details
2. ✓ SignalPropagator centraliza eventos
3. ✓ Fácil para sistemas como VFX, audio, animaciones
4. ✓ Desacoplamiento total entre sistemas

---

## 8. RESUMEN COMPARATIVO

| Aspecto | Nuestro Código | Framework | Diferencia |
|---------|---|---|---|
| **Input Validation** | ❌ Ninguna | ✅ Por estado | Impacto: Alto |
| **Priority Handling** | ❌ Ambos cards responden | ✅ Solo top card | Impacto: Alto |
| **Long-Press** | ❌ Inmediato | ✅ 0.1s await | Impacto: Medio |
| **State Machine** | ❌ Booleans | ✅ Enum + setter | Impacto: Alto |
| **Process Logic** | ❌ Esparcida | ✅ Centralizada | Impacto: Medio |
| **Animation Control** | ❌ Autónoma | ✅ Por estado | Impacto: Medio |
| **Signals** | ❌ Básicos | ✅ Propagación | Impacto: Bajo |
| **Coordinación Global** | ❌ None | ✅ Flags globales | Impacto: Alto |
| **Lines of Code** | 350 | 2814 | Framework es más completo |

---

## 9. NIVEL DE COMPLEJIDAD A ADOPTAR

### Minimalista (Ahora)
```
- CardState enum
- Input validation por state
- Global drag flag
- Tiempo: 2h
- Fixes: Cartas funcionan en partidas
```

### Estándar (Recomendado)
```
- Todo anterior +
- Long-press detection
- Process-based animations
- Tiempo: 4h
- Fixes: Architecture sólida
```

### Completo (Nice to Have)
```
- Todo anterior +
- Signal propagation
- MousePointer tracking
- Input prioritization
- Tiempo: 6h
- Fixes: Profesional
```

---

## 10. PRÓXIMOS PASOS

1. ✅ Leer este documento
2. ✅ Entender las diferencias
3. ⏳ Decidir nivel de complejidad
4. ⏳ Implementar CardState enum
5. ⏳ Validar en TestBoard
6. ⏳ Escalar a GameBoard

