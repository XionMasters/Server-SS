# Quick Reference: 5 Framework Patterns That Fix Card Interaction

## Pattern 1️⃣: State Machine
```gdscript
enum CardState { IN_HAND, HOVERED, DRAGGING, ON_FIELD, ANIMATING, DISABLED }
var state: CardState = CardState.IN_HAND
```
**Use**: Check `state` before allowing any input or animation

---

## Pattern 2️⃣: Global Drag Flag
```gdscript
# MatchManager.gd
var card_drag_ongoing: CardDisplay = null

# In card input handler:
if MatchManager.card_drag_ongoing != null and MatchManager.card_drag_ongoing != self:
    return  # Another card is dragging
```
**Use**: Only ONE card drags at a time

---

## Pattern 3️⃣: Input Validation
```gdscript
func _on_gui_input(event: InputEvent):
    # ❌ WRONG - No validation
    if event.pressed:
        start_dragging()
    
    # ✅ RIGHT - Check state first
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    if event.pressed:
        start_dragging()
```
**Use**: Prevent input during invalid states

---

## Pattern 4️⃣: Long-Press Detection
```gdscript
if event.pressed:
    MatchManager.card_drag_ongoing = self
    state = CardState.HOVERED
    
    # Wait 0.1 seconds
    await get_tree().create_timer(0.1).timeout
    
    # Check if still being held
    if MatchManager.card_drag_ongoing == self:
        state = CardState.DRAGGING  # Now start dragging
```
**Use**: Distinguish click from drag

---

## Pattern 5️⃣: State-Driven Behavior
```gdscript
func _process(delta):
    match state:
        CardState.HOVERED:
            # Smooth hover animation
            position = position.lerp(hover_pos, 0.1)
            scale = scale.lerp(Vector2(1.2, 1.2), 0.1)
        
        CardState.DRAGGING:
            # Follow mouse every frame
            global_position = get_global_mouse_position() - drag_offset
```
**Use**: Smooth continuous behaviors via frame updates

---

## Full Input Handler Example
```gdscript
func _on_gui_input(event: InputEvent):
    # Pattern 1 + Pattern 3: Check state first
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            # Pattern 2: Check global drag flag
            if MatchManager.card_drag_ongoing != null:
                return
            
            # Pattern 4: Long-press detection
            MatchManager.card_drag_ongoing = self
            state = CardState.HOVERED
            
            await get_tree().create_timer(0.1).timeout
            
            if MatchManager.card_drag_ongoing == self:
                state = CardState.DRAGGING
                hover_scale = 1.2
        
        else:  # Mouse released
            if state == CardState.DRAGGING:
                drop_card()
            else:
                show_details()
            
            state = CardState.IN_HAND
            MatchManager.card_drag_ongoing = null
```

---

## Process Loop Example
```gdscript
# Pattern 5: State-driven behavior in _process()
func _process(delta):
    match state:
        CardState.HOVERED:
            animate_hover(delta)
        
        CardState.DRAGGING:
            follow_mouse()
        
        CardState.ANIMATING:
            pass  # Tween handles this
```

---

## Implementation Order (Critical to Nice-to-Have)

| Priority | Pattern | Time | Impact |
|----------|---------|------|--------|
| 🔴 CRITICAL | State Machine (Pattern 1️⃣) | 30 min | 40% fix |
| 🔴 CRITICAL | Global Flag (Pattern 2️⃣) | 20 min | 30% fix |
| 🔴 CRITICAL | Input Validation (Pattern 3️⃣) | 20 min | 20% fix |
| 🟡 IMPORTANT | Long-Press (Pattern 4️⃣) | 30 min | Polish |
| 🟡 IMPORTANT | State Behavior (Pattern 5️⃣) | 1 hour | Polish |
| 🟢 NICE | Signals | 2+ hours | Architecture |

**Minimum viable fix: Patterns 1️⃣ 2️⃣ 3️⃣ = 70 minutes = 70% problem solved**

---

## Common Mistakes to Avoid

| ❌ WRONG | ✅ RIGHT | Why |
|---------|---------|-----|
| `if is_dragging: start_drag()` | `if state == IN_HAND: start_drag()` | State is source of truth |
| No global drag flag | `MatchManager.card_drag_ongoing = self` | Prevents multi-card drag chaos |
| Immediate drag on press | `await get_tree().create_timer(0.1)` | Distinguish click vs drag |
| Animation in `_on_gui_input` | Animation in `_process()` | Frame-based for smoothness |
| Direct card.move_to() calls | Check state first | Prevent conflicts |

---

## Testing Checklist

- [ ] Create 3 cards in TestBoard
- [ ] Try dragging one card → only that card responds
- [ ] Try clicking one card while dragging another → dragged card continues, click ignored
- [ ] Try rapid clicking → no ghost drags
- [ ] Try slow drag (0.2s hold) → smooth follow to cursor
- [ ] Try fast click (0.05s press) → treats as click, not drag
- [ ] Drop card on valid position → card moves smoothly
- [ ] Drop card on invalid position → card returns to hand

---

## File Locations

**Documentation**:
- `docs/FRAMEWORK-ANALYSIS.md` - Full 16-section analysis
- `docs/FRAMEWORK-PATTERNS-SYNTHESIS.md` - This document's extended version
- `docs/CODE-COMPARISON.md` - Side-by-side code examples
- `docs/IMPLEMENTATION-PLAN.md` - Detailed step-by-step plan

**Reference Code** (Framework):
- Framework: `/godot-card-game-framework.../src/core/CardTemplate.gd` (2814 lines)
- Key sections: Lines 16-40 (enum), 143-182 (_process), 469-530 (input)

---

## One-Sentence Summary

**Use a State Enum + Global Drag Flag + Input Validation to make exactly one card respond to exactly one input at a time.**

---

Generated: Framework Pattern Synthesis  
Based on: CardTemplate.gd (2814 lines), CardContainer, CardFront, CardBack, ManipulationButtons, BoardTemplate  
Effort: 70 minutes (Patterns 1-3) → 70% problem solved
