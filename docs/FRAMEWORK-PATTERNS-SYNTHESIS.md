# Framework Pattern Synthesis: Key Insights for Card Implementation

## Executive Summary

The Godot Card Game Framework uses **5 core architectural patterns** that solve the card interaction problem completely. This document synthesizes these patterns into actionable insights for your game.

---

## Pattern 1: State Machine as Single Source of Truth

### The Framework Pattern

```gdscript
# CardTemplate.gd lines 16-40
enum CardState {
    IN_HAND,
    FOCUSED_IN_HAND,
    DRAGGED,
    ON_PLAY_BOARD,
    FOCUSED_ON_PLAY_BOARD,
    DISABLED,
    PREVIEW,
    UNDEALT,
    REMOVING_FROM_PLAY,
    MOVING_TO_PILE,
    TO_DELETE,
    MOVING_TO_BOARD,
    RESHUFFLING_BACK_TO_PILE,
    MOVING_TO_CONTAINER,
    HIGHLIGHTED_FOR_MANIPULATION,
    HIGHLIGHTED_FOR_TARGETING,
    MOVING_TO_HAND
}

var card_state: CardState = CardState.IN_HAND
```

### Why It Works

- **Single Source of Truth**: Card's behavior determined entirely by `card_state`
- **No Race Conditions**: All logic checks state before operating
- **Coordination**: Every subsystem (input, animation, rendering) checks state independently
- **Debugging**: You can always know "what is this card doing?" by checking one variable

### Your Adaptation (Recommended)

```gdscript
# scripts/cards/CardDisplay.gd
enum CardState {
    IN_HAND,
    HOVERED_IN_HAND,
    DRAGGING,
    ON_FIELD,
    FOCUSED_ON_FIELD,
    ANIMATING,
    DISABLED
}

var state: CardState = CardState.IN_HAND

func _on_gui_input(event: InputEvent):
    # PATTERN: Check state FIRST
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return  # Ignore input during these states
    
    if event is InputEventMouseButton:
        if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
            state = CardState.DRAGGING
            start_dragging()
```

---

## Pattern 2: Global Drag Coordination Flag

### The Framework Pattern

```gdscript
# CardTemplate.gd line 469 (within _on_Card_gui_input)
if event.pressed:
    # Check if ANY card is currently being dragged
    if cfc.card_drag_ongoing:
        return
    
    # If we get here, we're the first card to start dragging
    cfc.card_drag_ongoing = self
    # ... start drag logic
```

### Why It Works

- **Prevents Multiple Drags**: Only ONE card can be dragged at a time (checked globally)
- **Clean Initialization**: First card to press sets the flag
- **Clean Cleanup**: Releasing sets flag to null
- **Other Cards Know**: When other cards see `cfc.card_drag_ongoing` is not None, they ignore input

### Your Implementation

```gdscript
# scripts/managers/MatchManager.gd
class_name MatchManager
extends Node

# Global drag coordination flag
var card_drag_ongoing: CardDisplay = null

# In GameBoard.gd:
func _on_card_gui_input(event: InputEvent, card: CardDisplay):
    # PATTERN: Check if another card is dragging
    if MatchManager.card_drag_ongoing != null and MatchManager.card_drag_ongoing != card:
        return  # Another card is dragging, ignore input
    
    if event is InputEventMouseButton:
        if event.pressed:
            MatchManager.card_drag_ongoing = card
            card.start_dragging()
        else:
            MatchManager.card_drag_ongoing = null
            card.stop_dragging()
```

---

## Pattern 3: Input Prioritization Before Drag Starts

### The Framework Pattern

```gdscript
# CardTemplate.gd lines 2008-2030
func _start_dragging():
    # Long-press detection pattern:
    # 1. Set ourselves as "candidate" for dragging
    cfc.card_drag_ongoing = self
    
    # 2. Wait 0.1 seconds to distinguish click from drag
    await get_tree().create_timer(0.1).timeout
    
    # 3. After wait, check if we're STILL being pressed
    if cfc.card_drag_ongoing == self:
        # We're still being held down, so it's a drag
        card_state = CardState.DRAGGED
        focus_on_board()  # Animate to front
    # If card_drag_ongoing changed, another input happened, so we do nothing
```

### Why It Works

- **Distinguishes Click from Drag**: 0.1s wait before committing to drag
- **Handles Multi-Card Scenarios**: If user presses a new card during wait, flag changes
- **Automatic Timeout**: Timer cleanup prevents zombie states
- **Respects Input Priority**: User can cancel by pressing another card

### Your Implementation

```gdscript
# scripts/cards/CardDisplay.gd
func _on_gui_input(event: InputEvent):
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            # PATTERN: Long-press detection for drag
            MatchManager.card_drag_ongoing = self
            state = CardState.HOVERED_IN_HAND
            
            # Wait to distinguish click from drag
            await get_tree().create_timer(0.1).timeout
            
            # If we're still being held and no other card took over
            if MatchManager.card_drag_ongoing == self:
                state = CardState.DRAGGING
                hover_scale = 1.2
        else:  # Mouse released
            if MatchManager.card_drag_ongoing == self:
                if state == CardState.DRAGGING:
                    stop_dragging()  # Complete drag
                else:
                    # Was just a click/hover, not a full drag
                    show_card_info()  # Or whatever your click action is
                
                MatchManager.card_drag_ongoing = null
            state = CardState.IN_HAND
```

---

## Pattern 4: Process-Based State Machine

### The Framework Pattern

```gdscript
# CardTemplate.gd lines 143-182 (_process_card_state called from _process)
func _process_card_state(delta: float) -> void:
    match card_state:
        CardState.FOCUSED_IN_HAND, CardState.FOCUSED_ON_PLAY_BOARD:
            animate_hover()  # Continuous hover effect
        
        CardState.DRAGGED:
            follow_mouse()  # Update position every frame
        
        CardState.MOVING_TO_CONTAINER, CardState.MOVING_TO_BOARD:
            pass  # Tween handles animation (checked in _ready)
        
        CardState.HIGHLIGHTED_FOR_TARGETING:
            animate_glow()  # Pulsing glow effect
        
        CardState.HIGHLIGHTED_FOR_MANIPULATION:
            animate_outline()  # Static highlight
```

### Why It Works

- **Frame-Based Updates**: Animations and position updates in `_process`
- **State-Driven Rendering**: Each state has specific visual behavior
- **Smooth Movements**: Drag position updates every frame for responsiveness
- **No Event Spam**: One place where all continuous behaviors are managed

### Your Adaptation

```gdscript
# scripts/cards/CardDisplay.gd
func _process(delta: float):
    match state:
        CardState.HOVERED_IN_HAND:
            # Smoothly animate toward hover position
            position = position.lerp(hover_position, 0.1)
            scale = scale.lerp(Vector2(1.2, 1.2), 0.1)
        
        CardState.DRAGGING:
            # Follow mouse in real-time
            global_position = get_global_mouse_position() - drag_offset
        
        CardState.ANIMATING:
            # Tween is handling this, but we could add effects here
            pass
```

---

## Pattern 5: Component-Based Card Architecture

### The Framework Pattern

The framework splits a Card into modular sub-components:

```
CardTemplate.gd (main orchestrator)
├── CardFront.gd (renders card face with labels)
├── CardBack.gd (renders card back with animation hooks)
├── ManipulationButtons.gd (spawns action buttons, toggles visibility)
├── TargetingArrow.gd (shows targeting line for special abilities)
├── TokenDrawer.gd (renders status tokens/effects)
└── [Subclasses for special card types]
```

**Key Insight**: Each component watches the parent card's `card_state` and responds accordingly.

```gdscript
# ManipulationButtons.gd (simplified)
func set_active(value = true) -> void:
    _are_active = value
    # Deactivate buttons when card is dragging or in invalid state
    var button_filter := 1 if value else 2
    for button in get_children():
        if button as Button:
            button.mouse_filter = button_filter

# Called when card_state changes
func _on_card_state_changed(new_state: CardState):
    if new_state == CardState.DRAGGED:
        set_active(false)  # Hide buttons while dragging
    elif new_state == CardState.ON_PLAY_BOARD:
        set_active(true)  # Show buttons on board
```

### Your Adaptation Strategy

**Current (Monolithic)**:
```
CardDisplay.gd (350 lines doing everything)
├── Position logic
├── Rendering
├── Input handling
├── Animation
└── Drag detection (all mixed together)
```

**Refactored (Component-Based)**:
```
CardDisplay.gd (300 lines - state machine + coordination)
├── CardVisuals.gd (rendering, colors, effects)
├── CardInput.gd (mouse events, drag detection)
├── CardAnimations.gd (tweens, position updates)
└── CardStateManager.gd (state transitions, validation)
```

This is **Phase 2** after fixing the immediate interactivity issue. **Phase 1** is fixing state machine + global flag.

---

## Pattern 6: Signal Propagation Architecture

### The Framework Pattern

Instead of direct function calls, the framework uses signals for decoupling:

```gdscript
# CardTemplate.gd
signal card_state_changed(new_state: CardState)
signal card_targeted(card: Card)
signal card_attached(card: Card, amount: int)

func _set_card_state(new_state: CardState):
    card_state = new_state
    card_state_changed.emit(new_state)  # Parents, containers, UI listen

# Hand.gd or any container
func _on_card_state_changed(new_state: CardState):
    if new_state == CardState.MOVING_TO_HAND:
        reorganize_cards()  # Re-layout hand
```

### Why It Matters

- **Loose Coupling**: Cards don't directly call board/hand methods
- **Scalable**: New listeners can attach without modifying card code
- **Debugging**: Signal debugger shows all events in chronological order
- **Prevents Loops**: No circular dependencies

### Your Adaptation (Phase 2+)

```gdscript
# scripts/cards/CardDisplay.gd
signal state_changed(new_state: CardState)
signal card_clicked(card: CardDisplay)
signal card_drag_started(card: CardDisplay)
signal card_drag_ended(card: CardDisplay)

# scripts/game/HandLayout.gd
func _ready():
    # Listen to state changes
    for card in player_hand.get_cards():
        card.state_changed.connect(_on_card_state_changed)
        card.card_drag_ended.connect(_on_card_drag_ended)

func _on_card_drag_ended(card: CardDisplay):
    reorganize_hand_layout()  # Re-layout after drag
```

---

## Implementation Priority Matrix

### Phase 1: CRITICAL (Fixes Card Interaction)
✅ **Effort**: 2-3 hours | **Impact**: 70-80% of problem solved

1. Add `CardState` enum (6-8 states)
2. Add `card_drag_ongoing` global flag to MatchManager
3. Add state checks in `_on_gui_input()` 
4. Add input validation before drag starts
5. Test on TestBoard first

**Result**: Cards respond to clicks and drags in GameBoard

### Phase 2: IMPORTANT (Polishes Interaction)
✅ **Effort**: 2-3 hours | **Impact**: Smooth feel, no jank

1. Add `_process()` with state-based animation logic
2. Add hover effects (scaling, position animation)
3. Add smooth drag following mouse
4. Implement proper drag drop validation

**Result**: Professional-quality card handling, smooth animations

### Phase 3: NICE-TO-HAVE (Professional Architecture)
✅ **Effort**: 3-4 hours | **Impact**: Maintainability, extensibility

1. Split CardDisplay into modular components
2. Implement signal propagation system
3. Add container reorganization on state changes
4. Add card effects/glow system responding to state

**Result**: Maintainable, extensible codebase matching framework quality

---

## Code Comparison: Framework vs Your Game

### Input Handling

**Framework (CardTemplate.gd lines 469-530)**:
```gdscript
func _on_Card_gui_input(event: InputEvent) -> void:
    # VALIDATION: Check if card can receive input
    if card_state in [CardState.DISABLED, CardState.MOVING_TO_CONTAINER, CardState.PREVIEW]:
        return
    
    # VALIDATION: Check if another card is dragging
    if cfc.card_drag_ongoing and cfc.card_drag_ongoing != self:
        return
    
    if event is InputEventMouseButton:
        if event.pressed:
            # LONG-PRESS PATTERN: Prepare for drag
            cfc.card_drag_ongoing = self
            card_state = CardState.FOCUSED_IN_HAND
            focus_on_board()  # Animate up
        else:
            # Release: determine if it was click or drag
            if card_state == CardState.DRAGGED:
                # Complete the drag
                move_to(target_position)
            else:
                # Just a click/hover
                emit_signal("card_selected", self)
            
            cfc.card_drag_ongoing = null
            card_state = CardState.IN_HAND
```

**Your Game (CardDisplay.gd lines ~150)**:
```gdscript
func _on_gui_input(event: InputEvent) -> void:
    if not is_playable:  # Doesn't check for dragging state
        return
    
    if event is InputEventMouseButton:
        if event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
            start_dragging()  # IMMEDIATE - no validation!
        else:
            stop_dragging()
```

**Problem**: No state validation → multiple cards respond to clicks → chaos

### State-Driven Behavior

**Framework (CardTemplate.gd lines 143-182)**:
```gdscript
func _process_card_state(delta: float) -> void:
    match card_state:
        CardState.FOCUSED_IN_HAND:
            animate_hovering()  # Smooth position/scale animation
        CardState.DRAGGED:
            follow_mouse()  # Update global_position every frame
        CardState.MOVING_TO_PILE:
            pass  # Tween is handling this
        CardState.HIGHLIGHTED_FOR_TARGETING:
            animate_highlight_pulse()  # Pulsing glow
```

**Your Game (CardDisplay.gd)**:
```gdscript
func _process(delta: float):
    if is_dragging:  # Only checks dragging flag
        global_position = get_global_mouse_position() - drag_offset
    # No state-based hover animation
    # No state-based highlight animation
```

**Problem**: Limited behaviors → feels unresponsive

---

## Quick Migration Checklist

### ✅ Minimal Fix (2-3 hours) - START HERE

- [ ] Add CardState enum to CardDisplay.gd (6 states minimum)
- [ ] Add `var card_state: CardState = CardState.IN_HAND` 
- [ ] Add state validation check at start of `_on_gui_input()`
- [ ] Add `MatchManager.card_drag_ongoing` flag
- [ ] Add global drag validation in input handler
- [ ] Test click/drag on TestBoard with multiple cards
- [ ] Test on GameBoard ✅ Cards now respond!

### ✅ Standard Upgrade (4-5 hours) - Phase 2

- [ ] Move hover animation to `_process()` (CardState.FOCUSED_IN_HAND)
- [ ] Move drag following to `_process()` (CardState.DRAGGED)
- [ ] Add smooth position/scale animation (lerp)
- [ ] Add state transition effects
- [ ] Test drag smoothness and responsiveness
- [ ] Verify no animation conflicts

### ✅ Professional Polish (6+ hours) - Phase 3

- [ ] Extract CardVisuals component
- [ ] Extract CardInput component  
- [ ] Implement state change signals
- [ ] Add container coordination on state changes
- [ ] Refactor HandLayout to listen to card signals
- [ ] Add effects/glow system responding to states

---

## Key Files to Reference

| Framework File | Lines | Key Pattern |
|---|---|---|
| `CardTemplate.gd` | 16-40 | CardState enum (17 states) |
| `CardTemplate.gd` | 143-182 | _process() state machine |
| `CardTemplate.gd` | 445-530 | _on_Card_gui_input() with validation |
| `CardTemplate.gd` | 2008-2030 | _start_dragging() with long-press |
| `CFInt.gd` | 19-50+ | Central enums (RunType, FocusStyle, etc.) |
| `CFUtils.gd` | 1-80+ | Utility functions (shuffle, rng, etc.) |
| `CardFront.gd` | 1-100+ | Label management, rendering |
| `CardBack.gd` | 1-50 | Animation hooks pattern |
| `ManipulationButtons.gd` | 1-100 | Component state responsiveness |
| `BoardTemplate.gd` | 1-150 | Board-level coordination, MousePointer |

---

## Debugging Strategy

### Current Problem Diagnosis
```gdscript
# Add this to GameBoard.gd to see what's happening:
func _process(delta):
    for card in player_hand.get_cards():
        print("Card %s - State: %s, Dragging: %s" % [
            card.card_data.name,
            "UNKNOWN",  # We don't have state enum yet
            card.is_dragging
        ])
```

### After Phase 1 Fix
```gdscript
func _process(delta):
    for card in player_hand.get_cards():
        print("Card %s - State: %s, GlobalDrag: %s, CanInput: %s" % [
            card.card_data.name,
            CardDisplay.CardState.keys()[card.state],
            MatchManager.card_drag_ongoing != null,
            card.state not in [CardDisplay.CardState.ANIMATING, CardDisplay.CardState.DRAGGING]
        ])
```

---

## Next Steps

1. **TODAY**: Review this document + FRAMEWORK-ANALYSIS.md
2. **TOMORROW**: Implement Phase 1 (CardState enum + validation)
3. **Test**: Run on TestBoard with multiple cards
4. **Verify**: Drag, drop, click behaviors work
5. **Extend**: Phase 2 (smooth animations) if time permits
6. **Plan**: Phase 3 (components) for next sprint

---

**Document Created**: Framework Pattern Synthesis
**Based On**: Review of CardTemplate.gd (2814 lines), CardContainer, Hand, Pile, CardFront, CardBack, ManipulationButtons, CFInt, CFUtils, BoardTemplate
**For**: Caballeros Cósmicos Godot Client - Card Interaction Fix
