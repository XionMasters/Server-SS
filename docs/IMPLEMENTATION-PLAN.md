# Plan de Acción: Incorporación del State Machine Pattern

**Status**: Identificación completada  
**Próximo Paso**: Implementación

---

## RESUMEN DE HALLAZGOS

### El Root Cause del Problema

El usuario reportó: **"Las cartas no funcionan en las partidas"**

**Raíz Identificada** (del análisis del framework):
- Las cartas EN PARTIDA no tienen validación de estado
- Múltiples cards pueden procesar input simultáneamente
- No hay diferencia entre click rápido y drag
- Las animaciones interfieren con input

### Comparación Código

**Problema en nuestro CardDisplay.gd:**
```gdscript
func _on_gui_input(event: InputEventMouseButton) -> void:
    if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        card_clicked.emit(self)  # ❌ Sin validación
```

**Solución en CardTemplate.gd (framework):**
```gdscript
func _on_Card_gui_input(event) -> void:
    if event is InputEventMouseButton and cfc.NMAP.has("board"):
        # ✅ Validar si otra card está siendo procesada
        if cfc.NMAP.board.mouse_pointer.current_focused_card \
                and self != cfc.NMAP.board.mouse_pointer.current_focused_card:
            cfc.NMAP.board.mouse_pointer.current_focused_card._on_Card_gui_input(event)
            
        # ✅ Validar estado del card
        elif event.is_pressed() and event.get_button_index() == 1 \
                and not buttons.are_hovered() \
                and not tokens.are_hovered():
            
            # ✅ Diferencia click vs drag con await
            if event.doubleclick:
                execute_scripts()
            else:
                if state in [CardState.FOCUSED_IN_HAND, CardState.FOCUSED_ON_BOARD]:
                    cfc.card_drag_ongoing = self
                    await get_tree().create_timer(0.1).timeout
                    if cfc.card_drag_ongoing == self:
                        _start_dragging(event.position)
```

---

## WHAT TO IMPLEMENT - PRIORITY MATRIX

| Componente | Priority | Impact | Effort | Status |
|-----------|----------|--------|--------|--------|
| CardState enum | 🔴 HIGH | Fix main issue | 0.5h | TODO |
| Input validation by state | 🔴 HIGH | Fix clicks in-game | 1h | TODO |
| Global drag flag | 🔴 HIGH | Prevent multi-drag | 0.5h | TODO |
| Long-press detection | 🟠 MEDIUM | Proper click vs drag | 1h | TODO |
| Process-based state handling | 🟠 MEDIUM | Better animations | 1.5h | TODO |
| Signal propagation | 🟡 LOW | Better architecture | 1h | TODO |

---

## INTEGRATION ROADMAP

### Opción A: Minimal (Soluciona el problema)
**Tiempo**: 2-3 horas
**Resultado**: Cartas funcionales en partidas

1. Agregar CardState enum a CardDisplay
2. Reemplazar `is_focused` boolean con estado
3. Validar estado en `_on_gui_input()`
4. Agregar global flag en MatchManager
5. Probar en TestBoard

### Opción B: Completa (Óptima, siguiendo framework)
**Tiempo**: 4-5 horas
**Resultado**: Architecture sólida, fácil de extender

1. Todo de Opción A +
2. Long-press detection
3. Process-based animations
4. Input prioritization con mouse tracking
5. Signal propagation para eventos
6. Aplicar a GameBoard completo

### Opción C: Gradual (Recomendada)
**Sesión 1** (Ahora): Opción A
**Sesión 2**: Long-press detection + Process-based
**Sesión 3**: Input prioritization + Signals

---

## DOCUMENTOS GENERADOS

✅ `FRAMEWORK-ANALYSIS.md` - Análisis completo de 16 secciones
✅ `THIS FILE` - Plan de acción

### Próximos Pasos del Usuario

1. Revisa `FRAMEWORK-ANALYSIS.md` - 15 min lectura
2. Decidir entre Opción A, B o C - 5 min
3. Proceder con implementación - 2-5 horas

---

## QUICK REFERENCE: CÓDIGO A COPIAR

### CardState Enum (Agregar a CardDisplay.gd top)

```gdscript
enum CardState {
    IN_HAND = 0,
    FOCUSED_IN_HAND = 1,
    DRAGGED = 2,
    ON_BOARD = 3,
    FOCUSED_ON_BOARD = 4,
    ANIMATING = 5
}

var card_state: int = CardState.IN_HAND: set = set_card_state

signal state_changed(card, old_state, new_state)

func set_card_state(value: int) -> void:
    if card_state == value:
        return
    var prev_state = card_state
    card_state = value
    state_changed.emit(self, prev_state, value)
```

### Global Flag (En MatchManager.gd)

```gdscript
# Variable que trackea qué card se está arrastrando actualmente
var card_drag_ongoing: CardDisplay = null

func _process(_delta):
    # Limpiar si el card fue liberado
    if card_drag_ongoing and not is_instance_valid(card_drag_ongoing):
        card_drag_ongoing = null
```

### Validación en Input Handler

```gdscript
func _on_gui_input(event: InputEventMouseButton) -> void:
    # ✅ NEW: Validar estado
    if card_state in [CardState.ANIMATING, CardState.DRAGGED]:
        return
    
    # ✅ NEW: Validar si otra card está siendo arrastrada
    if MatchManager.card_drag_ongoing != null and MatchManager.card_drag_ongoing != self:
        return
    
    if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
        if card_state == CardState.FOCUSED_IN_HAND:
            _on_mouse_pressed(event)
        elif card_state == CardState.FOCUSED_ON_BOARD:
            _on_mouse_pressed(event)
```

---

## TEST PLAN

### Test 1: Card Click en Mano
1. Abrir partida
2. Click en una carta
3. ✅ Debe emitir `card_clicked` signal
4. ✅ No debe hacerlo si está animando

### Test 2: Drag Detection
1. Click + hold en una carta
2. Esperar 0.1 segundos
3. ✅ Si sigue presionado = drag
4. ✅ Si suelta rápido = solo click

### Test 3: Multi-Card Protection
1. Click + hold en carta 1
2. Click + hold en carta 2 (durante drag de 1)
3. ✅ Carta 2 debe ignorar input
4. ✅ Solo Carta 1 se arrastra

### Test 4: State Transitions
1. Verificar transiciones:
   - `IN_HAND` → `FOCUSED_IN_HAND` (mouse enter)
   - `FOCUSED_IN_HAND` → `DRAGGED` (long press)
   - `DRAGGED` → `ON_BOARD` (mouse release)
   - `ON_BOARD` → `FOCUSED_ON_BOARD` (mouse enter)

---

## NOTAS ADICIONALES

### Por Qué el Framework Usa Estos Patrones

1. **States** → Evita estados inconsistentes, fácil debugging
2. **Global flags** → Coordinación sin coupling
3. **Long-press** → Experiencia de usuario mejorada
4. **Signals** → Architecture desacoplada
5. **Process-based** → Control granular de lógica temporal

### Qué NO Necesitamos Copiar

❌ Toda la jerarquía de clases (Hand, Pile, etc.)
❌ ScriptingEngine (sistema de scripts complejos)
❌ BoardPlacementGrid (grilla automática)
❌ TokenDrawer (tokens en cartas)

✅ Estado machine pattern
✅ Input validation
✅ Drag coordination
✅ Signal architecture

---

## NEXT SESSION TODO

[ ] Leer `FRAMEWORK-ANALYSIS.md`
[ ] Decidir Opción A/B/C
[ ] Implementar CardState enum
[ ] Implementar global drag flag
[ ] Validar en `_on_gui_input()`
[ ] Test en TestBoard
[ ] Aplicar a GameBoard si Opción B/C

