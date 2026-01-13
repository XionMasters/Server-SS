# Análisis del Godot Card Game Framework - Incorporación de Patrones

**Fecha**: 5 de Diciembre 2025  
**Objetivo**: Analizar el framework de ejemplo y determinar qué patrones podemos incorporar a nuestro proyecto

---

## 1. ARQUITECTURA GENERAL

### Framework vs Nuestro Proyecto

| Aspecto | CGF (Framework) | CCG (Nuestro) |
|---------|-----------------|----------------|
| **Card Base** | `CardTemplate.gd` (Area2D, 2814 líneas) | `CardDisplay.gd` (PanelContainer, 350+ líneas) |
| **Estados** | 17 CardState enums | Sin implementación de estados |
| **Contenedores** | CardContainer, Hand, Pile | HandLayout, DeckDisplay |
| **Input Handling** | `_on_Card_gui_input()` + `_input()` global | `gui_input` solo |
| **Animaciones** | Tween extensas (20+ funciones) | Tweens básicos |
| **Drag & Drop** | Complejo con múltiples validaciones | Simple `_get_drag_data()` |

---

## 2. SISTEMA DE ESTADOS - EL PATRÓN CLAVE

### El Problem Que Solucionan

En el framework, cada card tiene un **state machine** que maneja su ciclo de vida:

```gdscript
enum CardState {
    IN_HAND              # Card en mano, sin interacción
    FOCUSED_IN_HAND      # Mouse sobre card en mano
    REORGANIZING         # Animando posición en mano
    DRAGGED              # Siendo arrastrada
    ON_PLAY_BOARD        # En el tablero sin interacción
    FOCUSED_ON_BOARD     # Mouse sobre card en tablero
    IN_PILE              # En una pila (face down)
    # ... 10 más
}
```

**Por qué esto importa para nosotros:**
- Previene interacciones inválidas (no puedo hacer click en una card que está animando)
- Cada estado tiene lógica diferente para input (`_on_Card_gui_input`)
- El hover (`_on_Card_mouse_entered`) también responde al estado
- Las animaciones saben qué hacer basándose en estado

### Cómo lo Implementan

```gdscript
func _on_Card_mouse_entered() -> void:
    match state:
        CardState.IN_HAND, CardState.REORGANIZING, CardState.PUSHED_ASIDE:
            if not cfc.card_drag_ongoing:
                set_state(CardState.FOCUSED_IN_HAND)
        CardState.ON_PLAY_BOARD:
            set_state(CardState.FOCUSED_ON_BOARD)
        CardState.IN_POPUP:
            set_state(CardState.FOCUSED_IN_POPUP)

func set_state(value: int) -> void:
    var prev_state = state
    state = value
    emit_signal("state_changed", self, prev_state, state)
```

**En nuestro caso actual:**
- No tenemos estados
- Todo se trata igual sin importar contexto
- No podemos saber si una card está siendo arrastrada globalmente

---

## 3. INPUT HANDLING: UNA SOLUCIÓN ELEGANTE

### Problema Actual en CCG

El usuario reportó: "Las cartas no responden a interacción en partidas"

**Razones posibles según el framework:**
1. **Falta de prioritización**: Si múltiples cards se superponen, ¿cuál recibe el input?
2. **Falta de estado global**: No sabemos si ya se está arrastrando otra card
3. **No hay validación de contexto**: Se intenta arrastrar una card en medio de una animación

### Solución del Framework

```gdscript
# En CardTemplate.gd línea 445
func _on_Card_gui_input(event) -> void:
    if event is InputEventMouseButton and cfc.NMAP.has("board"):
        # ⭐ Verificar si OTRA card ya está siendo procesada
        if cfc.NMAP.board.mouse_pointer.current_focused_card \
                and self != cfc.NMAP.board.mouse_pointer.current_focused_card:
            # Delegar al card con mayor índice
            cfc.NMAP.board.mouse_pointer.current_focused_card._on_Card_gui_input(event)
```

**Esto soluciona:**
- La card más arriba (mayor z-index) siempre recibe el input
- No hay conflicto si 2 cards están superpuestas
- El mouse_pointer es un singleton que trackea cuál card está "en foco"

### Diferencia con Nuestro Código

**Nuestro CardDisplay.gd:**
```gdscript
func _on_gui_input(event: InputEventMouseButton) -> void:
    if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        # Todo se trata igual
        card_clicked.emit(self)
```

**Lo que falta:**
- No hay verificación de si estamos en estado válido para input
- No hay coordinación global entre múltiples cards
- No hay long-press detection para diferenciar click vs drag

---

## 4. DRAG & DROP IMPLEMENTATION

### El Framework Usa un Patrón de 3 Fases

**Fase 1: Long-Press Detection**
```gdscript
# Esperar 0.1 segundos antes de empezar a arrastrar
cfc.card_drag_ongoing = self  # Flag global
await get_tree().create_timer(0.1).timeout
# Si el mouse sigue presionado, ir a fase 2
if cfc.card_drag_ongoing == self:
    _start_dragging(event.position)
```

**Por qué:** Diferencia entre un click rápido y un intento de drag

**Fase 2: Drag Offset Calculation**
```gdscript
func _start_dragging(drag_offset: Vector2) -> void:
    _drag_offset = drag_offset
    # Esto mantiene el card bajo el mouse durante el drag
```

**Fase 3: On Drop**
```gdscript
elif not event.is_pressed() and event.get_button_index() == 1:
    # Mouse button released
    match state:
        CardState.DRAGGED:
            var destination = cfc.NMAP.board
            if potential_container:
                destination = potential_container
            move_to(destination)
```

### Comparación con Nuestro Código

**Nuestro approach:**
```gdscript
func _get_drag_data(at_position: Vector2):
    # Se inicia inmediatamente sin validación
    return drag_data
```

**Ventajas del Framework:**
- ✅ Valida antes de empezar
- ✅ Maneja click vs drag correctamente  
- ✅ Coordina con global `card_drag_ongoing`
- ✅ Diferencia entre drop destinos válidos

---

## 5. MOUSE PRIORITY CON MousePointer

### Concepto Clave del Framework

Mantienen un singleton `MousePointer` que trackea:
```gdscript
class_name MousePointer

var current_focused_card: Card = null
    # El card que tiene máxima prioridad de input

func determine_global_mouse_pos() -> Vector2
    # Posición estandarizada del mouse
```

**En el Board:**
```gdscript
@onready var mouse_pointer = $MousePointer  # Singleton ref
```

**Cuando una card recibe gui_input:**
```gdscript
if cfc.NMAP.board.mouse_pointer.current_focused_card \
        and self != cfc.NMAP.board.mouse_pointer.current_focused_card:
    # Otra card está más arriba, pasarle el evento
    cfc.NMAP.board.mouse_pointer.current_focused_card._on_Card_gui_input(event)
```

### Por Qué Importa para Nosotros

**Problema Actual:**
- Si tenemos 2 cards superpuestas en la mano, ambas intentan responder al input
- No hay orden claro de quién "gana" la interacción

**Solución:**
- Usar `get_tree().get_overlapping_areas()` o similar
- Siempre dar prioridad al card con mayor `z_index`

---

## 6. FINITE STATE MACHINE EN `_process()`

### How It Works

```gdscript
func _process(delta) -> void:
    _process_card_state()  # <-- Esta función es enorme

func _process_card_state() -> void:
    match state:
        CardState.IN_HAND:
            # No hacer nada
            pass
        CardState.FOCUSED_IN_HAND:
            # Animar scale/position hacia arriba
            if not _focus_completed:
                _animate_focus()
                _focus_completed = true
        CardState.REORGANIZING:
            # Animar hacia su posición final en la mano
            # Puede ser cortada por otro evento
        CardState.DRAGGED:
            # Seguir la posición del mouse
            position = cfc.NMAP.board.mouse_pointer.determine_global_mouse_pos() - _drag_offset
```

**En nuestro código:**
- No tenemos `_process()` haciendo lógica diferente por estado
- Todo las animaciones son "fire and forget"

---

## 7. FOCUS SYSTEM CON PROPAGACIÓN

### El Framework Emite Signals Globales

```gdscript
# En CardTemplate.gd
signal card_rotated(card,trigger,details)
signal card_flipped(card,trigger,details)
signal card_moved_to_board(card,trigger,details)
signal state_changed(card, old_state, new_state)
signal dragging_started(card)

# Un singleton SignalPropagator escucha TODOS estos
```

**Utilidad:**
- Otros objetos pueden reaccionar a cambios en cards
- Sistema de eventos centralizado
- Fácil triggering de scripts/efectos

---

## 8. ANIMACIONES COORDINADAS CON ESTADOS

### Patrón: Tween + State

```gdscript
@onready var _tween := $Tween

func _process_card_state() -> void:
    match state:
        CardState.FOCUSED_IN_HAND:
            if not _tween.is_active():
                # Iniciar animación
                _tween.tween_property(self, "scale", Vector2(1.15, 1.15), 0.3)
        CardState.REORGANIZING:
            if not _tween.is_active():
                # Animar a posición calculada
                _tween.tween_property(self, "position", _target_position, 0.4)
```

**Control explícito:**
- No se inician múltiples tweens del mismo tipo
- Se pueden cancelar (`_tween.remove_all()`)
- El estado sabe cuándo esperar al tween

---

## 9. ORGANIZACIÓN DE MANO (Hand Layout)

### HandLayout vs Nuestro Approach

**Framework:**
```gdscript
# Hand.gd - Maneja la lógica de espaciado automático
func reorganize_stack() -> void:
    # Calcula posición y rotación para cada card
    # Maneja forma ovalada opcional
    # Cuenta el número total de cards
```

**Nuestro:**
- Usamos HBoxContainer (automático)
- Funciona pero es inflexible

### Ventaja del Framework

Permite patrones complejos:
- Mano ovalada (como en Magic: The Gathering)
- Zoom al pasar mouse
- Rotación suave de cards
- Animación cuando se agregan/quitan cards

---

## 10. CONTENEDORES: Hand vs Pile

### Jerarquía del Framework

```
CardContainer (base)
├── Hand (mano visible)
├── Pile (mazo/descarte)
└── [extensible]
```

**CardContainer base proporciona:**
- `get_all_cards()`
- `get_top_card()`
- `get_random_card()`
- `shuffle_cards()`
- `move_child()` management

**Hand específico:**
- `draw_card()`
- `hand_size` límite
- Exceso cards behavior

**Pile específico:**
- `get_stack_position()` - posición visual
- Popup para ver cartas
- Face down visual

**Nuestro:**
- `CardCollection` (buena abstracción)
- `HandLayout` extiende pero es muy simple
- `DeckDisplay` es un hack para mostrar números

---

## 11. TARJETAS EN JUEGO: BOARD

### El Board Maneja

```gdscript
# BoardTemplate.gd
# Tracking de todas las cards en el tablero
# Detección de overlaps para destinos válidos
# Grid-based o free-form placement

# Tiene referencias globales a:
# - mouse_pointer (para input prioritization)
# - signal_propagator (eventos)
# - NMAP (mapping de todos los nodos)
```

**En nuestro GameBoard.gd:**
- Renderizamos slots
- Pero no tenemos validación de destinos de drag

---

## 12. PUNTOS CLAVE A INCORPORAR A NUESTRO PROYECTO

### 🔴 CRÍTICO - Soluciona el Problem Actual

1. **Sistema de Estados (Simplificado)**
   - Agregar enum: `IN_HAND`, `FOCUSED_IN_HAND`, `DRAGGED`, `ON_BOARD`, `FOCUSED_ON_BOARD`
   - Validar estado antes de permitir input
   - Usar estado en `_process()` para control de animaciones

2. **Global Card Drag Flag**
   ```gdscript
   # En MatchManager o GameBoard
   var current_drag_card: CardDisplay = null
   ```
   - Evita que 2 cards se arrastren simultáneamente
   - Coordina input global

3. **Long-Press Detection**
   ```gdscript
   # En CardDisplay
   if is_pressed and event.get_button_index() == MOUSE_BUTTON_LEFT:
       cfc.card_drag_ongoing = self
       await get_tree().create_timer(0.1).timeout
       if cfc.card_drag_ongoing == self:
           _start_dragging()
   ```

### 🟠 IMPORTANTE - Mejora Significativa

4. **Input Prioritization**
   - El card con máximo z_index siempre recibe input
   - Evita conflictos de overlaps

5. **Coordinación de Animaciones**
   - Usar variable `_is_animating` global por card
   - No permitir drag/click durante animaciones

6. **Signal Propagation**
   - Emitir signals cuando card cambia estado
   - Otros sistemas pueden reaccionar

### 🟡 MEJORA - Nice to Have

7. **Mejor Drag Offset**
   - Ya lo implementamos pero usar el patrón del framework

8. **Hand Reorganization**
   - Mejor algoritmo que HBoxContainer
   - Soporte para forma de mano

---

## 13. PLAN DE IMPLEMENTACIÓN

### Fase 1: Estados (Próxima Sesión)
```
1. Agregar CardState enum a CardDisplay
2. Cambiar de boolean `is_focused` a `state`
3. Validar estado en _on_gui_input()
4. Usar estado en _process() para animaciones
```

### Fase 2: Coordinación Global
```
1. Crear variable global en MatchManager
2. Modificar _on_Card_gui_input() para verificar
3. Agregar long-press detection
```

### Fase 3: Input Prioritization
```
1. Crear MousePointer-like tracking
2. Verificar z_index en input handler
```

### Fase 4: Signal Propagation
```
1. Agregar signals relevantes
2. Conectar en GameBoard para reaccionar
```

---

## 14. CÓDIGO ESPECÍFICO A ADOPTAR

### A: Patrón de Estados Simplificado para Nosotros

```gdscript
# CardDisplay.gd - Agregar al top
enum CardState {
    IN_HAND,
    FOCUSED_IN_HAND,
    DRAGGED,
    ON_BOARD,
    FOCUSED_ON_BOARD,
    ANIMATING
}

var card_state: int = CardState.IN_HAND: set = set_card_state

func set_card_state(value: int) -> void:
    if card_state == value:
        return
    var prev_state = card_state
    card_state = value
    state_changed.emit(self, prev_state, value)

func _on_gui_input(event: InputEventMouseButton) -> void:
    # Validar estado PRIMERO
    if card_state in [CardState.ANIMATING, CardState.DRAGGED]:
        return
    
    if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        if card_state == CardState.FOCUSED_IN_HAND:
            _on_mouse_pressed(event)
```

### B: Long-Press Detection

```gdscript
func _on_mouse_pressed(event: InputEventMouseButton) -> void:
    # Flag global - debe estar en MatchManager
    if MatchManager.card_drag_ongoing != null:
        return
    
    MatchManager.card_drag_ongoing = self
    
    await get_tree().create_timer(0.1).timeout
    
    if MatchManager.card_drag_ongoing == self:
        # Todavía presionado, iniciar drag
        set_card_state(CardState.DRAGGED)
        _start_dragging(event.position)
    else:
        # Se soltó - no es un drag
        MatchManager.card_drag_ongoing = null
```

### C: Process-Based State Machine

```gdscript
func _process(delta: float) -> void:
    match card_state:
        CardState.FOCUSED_IN_HAND:
            if not is_animating:
                play_hover_animation()
        CardState.ON_BOARD:
            # Nothing special
            pass
        CardState.DRAGGED:
            # Seguir mouse
            global_position = get_global_mouse_position() - _drag_offset * scale
        CardState.ANIMATING:
            # Esperar que termine tween
            if not _tween.is_running():
                # Volver a estado anterior
                set_card_state(_previous_state)
```

---

## 15. RESUMEN EJECUTIVO

### Problema Diagnosticado
Las cartas no responden en partidas porque:
1. No hay validación de estado antes de procesar input
2. No hay coordinación global entre múltiples cards
3. No hay diferenciación entre click y drag
4. Las animaciones interfieren con input

### Solución del Framework
Usa un sistema de **Finite State Machine** que:
- Define estados claros para cada card
- Valida input basándose en estado
- Usa flag global `card_drag_ongoing`
- Implementa long-press detection
- Coordina animaciones con proceso

### Aplicabilidad a Nuestro Proyecto
**Alta**: El patrón es agnóstico a la plataforma, puedo adaptarlo directamente.

### Próximos Pasos
1. Implementar CardState enum (THIS SESSION)
2. Agregar validación de estado (THIS SESSION)
3. Agregar long-press detection (NEXT SESSION)
4. Refactorizar GameBoard para usar estados (NEXT SESSION)

---

## 16. ARCHIVOS DEL FRAMEWORK A REFERENCIA

- `src/core/CardTemplate.gd` - Líneas 25-50 (enums), 413-521 (input handler), 550-1100 (mouse handlers)
- `src/core/CardContainer.gd` - Líneas 1-200 (base class pattern)
- `src/core/Hand.gd` - Líneas 1-100 (container específico)
- `src/core/Pile.gd` - Líneas 1-150 (stack handling)
- `src/core/BoardTemplate.gd` - Para MousePointer reference

