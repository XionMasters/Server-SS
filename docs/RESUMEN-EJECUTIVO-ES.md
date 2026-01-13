# Resumen Ejecutivo: Cómo Arreglar la Interacción de Cartas

**Problema**: Las cartas no responden a clicks/drags en GameBoard, pero SÍ funcionan en TestBoard.

**Causa Raíz**: 
- ❌ Sin validación de estado antes de procesar input
- ❌ Sin bandera global para coordinar cuál carta está siendo arrastra
- ❌ Múltiples cartas responden simultáneamente al mismo click

**Solución**: 5 patrones del Framework (implementación 70 min)

---

## 🎯 Los 5 Patrones Que Arreglan Todo

### Patrón 1: State Machine (Máquina de Estados)
```gdscript
enum CardState { IN_HAND, HOVERED, DRAGGING, ON_FIELD, ANIMATING, DISABLED }
var state: CardState = CardState.IN_HAND
```
**Uso**: Una única variable que dice qué está haciendo la carta en todo momento.

---

### Patrón 2: Global Drag Flag (Bandera Global)
```gdscript
# En MatchManager.gd
var card_drag_ongoing: CardDisplay = null
```
**Uso**: Solo UNA carta puede estar siendo arrastrada a la vez (coordinación global).

---

### Patrón 3: Validación de Input
```gdscript
func _on_gui_input(event: InputEvent):
    # ❌ MAL: Sin validar
    if event.pressed:
        start_dragging()
    
    # ✅ BIEN: Validar primero
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    if event.pressed:
        start_dragging()
```
**Uso**: Rechazar input cuando la carta no está en estado válido.

---

### Patrón 4: Long-Press Detection (Detección de Presión Larga)
```gdscript
if event.pressed:
    MatchManager.card_drag_ongoing = self
    state = CardState.HOVERED
    
    # Esperar 0.1 segundos para distinguir click de drag
    await get_tree().create_timer(0.1).timeout
    
    if MatchManager.card_drag_ongoing == self:
        state = CardState.DRAGGING  # Ahora sí, empezar drag
```
**Uso**: Distinguir entre un click rápido y un drag prolongado.

---

### Patrón 5: Comportamiento Basado en Estado
```gdscript
func _process(delta):
    match state:
        CardState.HOVERED:
            # Animar hover suavemente cada frame
            position = position.lerp(hover_pos, 0.1)
            scale = scale.lerp(Vector2(1.2, 1.2), 0.1)
        
        CardState.DRAGGING:
            # Seguir mouse cada frame
            global_position = get_global_mouse_position() - drag_offset
```
**Uso**: Comportamientos suave y contínuos basados en el estado actual.

---

## 📋 Plan de Implementación: 70 Minutos

### Fase 1: State Machine (5 min)
**Archivo**: `scripts/cards/CardDisplay.gd`

Agregar al inicio:
```gdscript
enum CardState {
    IN_HAND,
    HOVERED_IN_HAND,
    DRAGGING,
    ON_FIELD,
    ANIMATING,
    DISABLED
}

var state: CardState = CardState.IN_HAND
```

**Cambio**: Reemplaza los variables `is_dragging` y `is_playable` con `state`.

---

### Fase 2: Global Flag (5 min)
**Archivo**: `scripts/managers/MatchManager.gd`

Agregar:
```gdscript
var card_drag_ongoing: CardDisplay = null
```

**Cambio**: Una única variable que MatchManager controla para coordinar.

---

### Fase 3: Validación de Input (30 min)
**Archivo**: `scripts/cards/CardDisplay.gd` - función `_on_gui_input()`

Reemplazar:
```gdscript
func _on_gui_input(event: InputEvent) -> void:
    if not is_playable:
        return
    
    if event is InputEventMouseButton:
        if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
            start_dragging()
        else:
            stop_dragging()
```

Con:
```gdscript
func _on_gui_input(event: InputEvent) -> void:
    # NUEVA: Validación de estado
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            # NUEVA: Verificar bandera global
            if MatchManager.card_drag_ongoing != null:
                return
            
            # NUEVA: Long-press detection
            MatchManager.card_drag_ongoing = self
            state = CardState.HOVERED_IN_HAND
            
            await get_tree().create_timer(0.1).timeout
            
            if MatchManager.card_drag_ongoing == self:
                state = CardState.DRAGGING
                hover_scale = 1.2
        
        else:  # Mouse soltado
            if MatchManager.card_drag_ongoing == self:
                if state == CardState.DRAGGING:
                    stop_dragging()
                else:
                    show_card_details()
                
                MatchManager.card_drag_ongoing = null
            
            state = CardState.IN_HAND
```

---

### Fase 4: Testing (20 min)
**Archivo**: `scripts/game/TestBoard.gd`

Modificar `_ready()`:
```gdscript
func _ready():
    # Crear 5 cartas en lugar de 1
    for i in range(5):
        var card_display = CARD_DISPLAY_TEMPLATE.instantiate()
        card_display.setup(test_card_data[i])
        player_hand.add_card(card_display)
```

**Tests**:
- ✅ Arrastrar una carta → solo esa se mueve
- ✅ Click en otra mientras arrastras → la otra ignora el click
- ✅ Soltar → la carta se coloca correctamente
- ✅ Click rápido → no se registra como drag
- ✅ Hold 0.2s → se convierte en drag suavemente

---

### Fase 5: Deployer a GameBoard (10 min)
- Copiar las funciones `_on_gui_input()` actualizada a CardDisplay.gd
- Agregar enum CardState a CardDisplay.gd
- Agregar variable `card_drag_ongoing` a MatchManager.gd
- ¡Listo! GameBoard ahora usa el código arreglado automáticamente

---

## ✨ Resultado Esperado

### Antes del Fix
```
1. Click carta A
   → Carta A comienza drag
2. Click carta B mientras arrastras A
   → Carta B TAMBIÉN comienza drag (¡BUG!)
3. Soltar mouse
   → Ambas cartas en estado inconsistente
   → "Las cartas no responden" ❌
```

### Después del Fix
```
1. Click carta A
   → Validación: ✅ estado válido
   → Global: ✅ nadie arrastrado
   → Long-press: esperar 0.1s
   → Carta A entra en DRAGGING ✅

2. Click carta B mientras A se arrastra
   → Validación: ✅ estado válido
   → Global: ❌ MatchManager.card_drag_ongoing != null
   → Retornar, IGNORAR click ✅

3. Soltar mouse
   → card_drag_ongoing = null
   → Carta A en estado consistente
   → Carta B no afectada
   → "Las cartas funcionan perfectamente!" ✅
```

---

## 📊 Comparación: Antes vs Después

| Aspecto | Antes | Después |
|--------|--------|---------|
| Multiple drag | ❌ Posible | ✅ Imposible |
| State tracking | 2 booleans | 1 enum |
| Input validation | ❌ Ninguna | ✅ Completa |
| Click vs drag | ❌ Inmediato | ✅ 0.1s espera |
| Coordina global | ❌ No | ✅ Sí |
| GameBoard funciona | ❌ Nope | ✅ Sí! |

---

## 🚀 Por Qué Funciona

1. **State Enum** → Responde a una sola pregunta: "¿Qué está haciendo esta carta?"
2. **Global Flag** → Responde: "¿Qué carta se está arrastrando globalmente?"
3. **Input Validation** → Si la respuesta a #1 no es válida, ignorar input
4. **Long-Press** → No comprometerse a drag hasta 0.1s después
5. **State-Driven Behavior** → Cada estado tiene comportamientos definidos

**Resultado**: Sistema predecible, coordinado, sin conflictos.

---

## 📚 Documentación de Referencia

| Documento | Propósito |
|-----------|-----------|
| `QUICK-REFERENCE.md` | Código copy-paste, checklist rápido |
| `FRAMEWORK-PATTERNS-SYNTHESIS.md` | Explicación detallada de cada patrón |
| `YOUR-PROJECT-vs-FRAMEWORK.md` | Análisis específico de tu proyecto |
| `FRAMEWORK-ANALYSIS.md` | Análisis profundo del framework |

---

## ⏱️ Estimación de Tiempo

| Fase | Tarea | Tiempo |
|------|-------|--------|
| 1 | Agregar enum CardState | 5 min |
| 2 | Agregar global flag | 5 min |
| 3 | Reescribir input handler | 30 min |
| 4 | Testing en TestBoard | 20 min |
| 5 | Deploy a GameBoard | 10 min |
| **TOTAL** | **Mínimo viable** | **70 min** |

---

## 🎓 Próximos Pasos (Opcional - Phase 2)

Después de que GameBoard funcione (70 min), puedes agregar:

### Phase 2: Animaciones Suaves (1-2 horas)
- Mover animación de hover a `_process()`
- Mover seguimiento de mouse a `_process()`
- Agregar transiciones suaves entre estados

### Phase 3: Arquitectura Profesional (2-3 horas)
- Dividir CardDisplay en componentes
- Agregar sistema de signals
- Refactorizar HandLayout para responder a cambios de estado

---

## ✅ Checklist de Implementación

### CardDisplay.gd
- [ ] Agregar enum CardState (6 estados)
- [ ] Agregar `var state: CardState = CardState.IN_HAND`
- [ ] Reescribir `_on_gui_input()` con validación
- [ ] Actualizar `start_dragging()` para cambiar estado
- [ ] Actualizar `stop_dragging()` para cambiar estado

### MatchManager.gd
- [ ] Agregar `var card_drag_ongoing: CardDisplay = null`

### TestBoard.gd
- [ ] Modificar para crear 5 cartas
- [ ] Test multi-card interaction

### GameBoard.gd
- [ ] ✅ Sin cambios (usa HandLayout existente)

---

## 🎯 Success Criteria

- ✅ GameBoard permite seleccionar múltiples cartas sin conflicto
- ✅ Solo una carta se arrastra a la vez
- ✅ Click en otra carta durante drag → se ignora
- ✅ Soltar mouse → cartas en estado correcto
- ✅ Sin errores de "ghost drag"
- ✅ Transición click ↔ drag diferenciada

---

**Documento**: Resumen Ejecutivo (Español)  
**Problema**: Card interaction rota en GameBoard  
**Solución**: 5 patrones del framework  
**Tiempo**: 70 minutos  
**Impacto**: 70% del problema resuelto  
**Esfuerzo**: Medio  
**Riesgo**: Bajo (sin breaking changes)
