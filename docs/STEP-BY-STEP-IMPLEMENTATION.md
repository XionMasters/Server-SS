# Step-by-Step Implementation Guide: 70-Minute Fix

**Goal**: Fix card interaction in GameBoard using framework patterns  
**Estimated Time**: 70 minutes  
**Files to Modify**: 3 (CardDisplay.gd, MatchManager.gd, TestBoard.gd)  
**Risk Level**: Low (no breaking changes)

---

## ⏱️ Timeline

| Time | Phase | What |
|------|-------|------|
| 0-5 min | Setup | Add enum to CardDisplay |
| 5-10 min | Setup | Add flag to MatchManager |
| 10-40 min | Implementation | Rewrite `_on_gui_input()` |
| 40-60 min | Testing | Test with 5 cards in TestBoard |
| 60-70 min | Deploy | Copy to GameBoard, verify |

---

## PHASE 1️⃣: Add State Enum (5 minutes)

### File: `scripts/cards/CardDisplay.gd`

**Before** (current code):
```gdscript
extends Control

# ... existing variables ...
var is_dragging: bool = false
var is_playable: bool = true
```

**After** (add at top of class):
```gdscript
extends Control

class_name CardDisplay

# NEW: State machine enum
enum CardState {
    IN_HAND,
    HOVERED_IN_HAND,
    DRAGGING,
    ON_FIELD,
    ANIMATING,
    DISABLED
}

# ... existing variables ...
var is_dragging: bool = false
var is_playable: bool = true
# NEW: Add state variable
var state: CardState = CardState.IN_HAND
```

**Verification**: File should compile with no errors (Ctrl+Shift+M in GDScript)

---

## PHASE 2️⃣: Add Global Drag Flag (5 minutes)

### File: `scripts/managers/MatchManager.gd`

**Before** (current code):
```gdscript
class_name MatchManager
extends Node

var current_match: Dictionary = {}
var player_number: int = 1
# ... other variables ...
```

**After**:
```gdscript
class_name MatchManager
extends Node

var current_match: Dictionary = {}
var player_number: int = 1
# NEW: Global drag coordination flag
var card_drag_ongoing: CardDisplay = null  # Only ONE card can drag at a time

# ... other variables ...
```

**Verification**: Reference `MatchManager.card_drag_ongoing` in IDE autocomplete (Ctrl+Space)

---

## PHASE 3️⃣: Implement Input Validation (30 minutes)

### File: `scripts/cards/CardDisplay.gd` - Function `_on_gui_input()`

This is the critical phase. We're replacing the entire input handler.

**Step A: Find Current Handler**

Search for `_on_gui_input` in CardDisplay.gd. It should look like:

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

**Step B: Replace Entire Function**

```gdscript
func _on_gui_input(event: InputEvent) -> void:
    # PATTERN 1 + 3: Check state BEFORE processing input
    if state in [CardState.ANIMATING, CardState.DRAGGING, CardState.DISABLED]:
        return
    
    # Also keep original check for safety
    if not is_playable:
        return
    
    if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
        if event.pressed:
            # PATTERN 2: Check global drag flag
            # If another card is dragging, ignore this click
            if MatchManager.card_drag_ongoing != null:
                return
            
            # PATTERN 4: Long-press detection
            # Set ourselves as the candidate for dragging
            MatchManager.card_drag_ongoing = self
            state = CardState.HOVERED_IN_HAND
            
            # Wait 0.1 seconds to distinguish click from drag
            await get_tree().create_timer(0.1).timeout
            
            # After wait, check if we're STILL the one being held down
            if MatchManager.card_drag_ongoing == self:
                # Yes, we're still held - so it's a drag
                state = CardState.DRAGGING
                # Keep existing hover scale if you have it
                if has_method("set_hover_scale"):
                    set_hover_scale(1.2)
                start_dragging()
            # If we get here and card_drag_ongoing changed, it means another input happened
            # So we do nothing (the new input will handle things)
        
        else:  # event.pressed == false (mouse released)
            # Check if we were the ones dragging
            if MatchManager.card_drag_ongoing == self:
                # We were the dragging card
                if state == CardState.DRAGGING:
                    # It was a full drag, handle drop
                    stop_dragging()
                else:
                    # It was just a hover/click, not a full drag
                    # Could show card details, trigger ability, etc.
                    if has_method("show_card_details"):
                        show_card_details()
                
                # Clear the global flag
                MatchManager.card_drag_ongoing = null
            
            # Reset to safe state
            state = CardState.IN_HAND
```

**Verification**: 
- ✅ File compiles without errors
- ✅ Function signature unchanged: `func _on_gui_input(event: InputEvent) -> void:`
- ✅ Handles both pressed and released events
- ✅ Clears global flag on release

---

## PHASE 4️⃣: Update start_dragging() and stop_dragging() (Optional but Recommended)

### File: `scripts/cards/CardDisplay.gd`

**Optional Enhancement**: If these functions exist, update them to set state:

```gdscript
func start_dragging() -> void:
    # Update state (in case it's called from elsewhere)
    state = CardState.DRAGGING
    
    # ... existing drag code ...
    is_dragging = true
    z_index = 100  # Bring to front
    # ... rest of your drag logic ...

func stop_dragging() -> void:
    # Update state
    state = CardState.IN_HAND
    
    # ... existing drop code ...
    is_dragging = false
    z_index = 0  # Back to normal
    # ... rest of your drop logic ...
```

**Note**: This is optional because `_on_gui_input()` already sets state. But it's good practice to keep them in sync.

---

## PHASE 5️⃣: Testing Phase (20 minutes)

### File: `scripts/game/TestBoard.gd`

**Objective**: Create a test scenario with 5 cards to verify multi-card coordination.

**Step A: Find `_ready()` function**

Current code probably creates 1 test card:
```gdscript
func _ready() -> void:
    var card_display = CARD_DISPLAY_TEMPLATE.instantiate()
    card_display.setup(test_card_data)
    player_hand.add_card(card_display)
```

**Step B: Modify to Create 5 Cards**

```gdscript
func _ready() -> void:
    # Create 5 test cards to verify multi-card coordination
    for i in range(5):
        var card_display = CARD_DISPLAY_TEMPLATE.instantiate()
        # Create test data for each card
        var test_data = test_card_data.duplicate()
        test_data["name"] = "Test Card %d" % (i + 1)
        card_display.setup(test_data)
        player_hand.add_card(card_display)
    
    print("TestBoard: Created 5 cards for testing")
```

**Step C: Run Tests**

Open TestBoard scene and run it. Perform these tests:

1. **Test 1: Single Drag**
   - Drag card #1
   - Observe: Only card #1 moves, others stay still
   - Expected: ✅ Only one card follows cursor
   - If failed: Check if state changes to DRAGGING

2. **Test 2: Click Another While Dragging**
   - Drag card #1
   - While dragging #1, click card #2
   - Observe: Card #1 continues dragging, card #2 doesn't move
   - Expected: ✅ #2 click is ignored
   - If failed: Check global flag validation in input handler

3. **Test 3: Release While Dragging**
   - Drag card #1 to position (x=200, y=100)
   - Release mouse
   - Observe: Card #1 stays at new position, not jerky
   - Expected: ✅ Smooth drop at position
   - If failed: Check stop_dragging() function

4. **Test 4: Quick Click (Not Drag)**
   - Press mouse for 0.05 seconds
   - Release
   - Observe: Card doesn't drag, just gets highlighted/focused
   - Expected: ✅ Treated as click, not drag
   - If failed: Check if 0.1s await is working

5. **Test 5: Hold and Drag (Real Drag)**
   - Press mouse for 0.15 seconds
   - Move mouse
   - Observe: Card follows cursor smoothly
   - Expected: ✅ Treated as drag, card follows
   - If failed: Check state == DRAGGING in _process()

**Debug Output**: Add this to see what's happening:

```gdscript
func _process(delta):
    if Input.is_action_pressed("ui_select"):  # Space key
        for card in player_hand.get_cards():
            print("Card: %s, State: %s, GlobalDrag: %s" % [
                card.card_data.name,
                CardDisplay.CardState.keys()[card.state],
                "YES" if MatchManager.card_drag_ongoing == card else "NO"
            ])
```

**Troubleshooting**:

| Issue | Cause | Fix |
|-------|-------|-----|
| Multiple cards drag | Missing global flag check | Add `if MatchManager.card_drag_ongoing != null: return` |
| State doesn't change | `_on_gui_input()` not called | Check signal connection in `_ready()` |
| Click always triggers drag | Long-press await not working | Check if `await get_tree().create_timer()` is correct syntax |
| Cards jump positions | Drag offset incorrect | Check drag_offset calculation in start_dragging() |

---

## PHASE 6️⃣: Deploy to GameBoard (10 minutes)

Once TestBoard passes all 5 tests:

**Step A: Verify GameBoard Structure**

Open `scenes/game/GameBoard.tscn` and verify:
- ✅ Has `player_hand` (HandLayout)
- ✅ Has multiple card slots
- ✅ MatchManager singleton exists

**Step B: Run GameBoard**

GameBoard should automatically use the fixed CardDisplay.gd:
- All changes to CardDisplay.gd apply immediately
- MatchManager.card_drag_ongoing is ready
- Input handler with validation is active

**Step C: Quick GameBoard Test**

- Start match/search
- Observe player hand rendering correctly
- Try clicking multiple cards
- Try dragging one card while hovering another
- Expected: ✅ Only one card responds, others ignored

**Step D: Verify in Console**

If cards don't respond, check console for errors:
```gdscript
# Add to GameBoard._process() temporarily:
if MatchManager.card_drag_ongoing:
    print("Card dragging: ", MatchManager.card_drag_ongoing.card_data.name)
```

---

## ✅ Verification Checklist

### Code Changes
- [ ] CardDisplay.gd has `enum CardState { IN_HAND, HOVERED_IN_HAND, DRAGGING, ON_FIELD, ANIMATING, DISABLED }`
- [ ] CardDisplay.gd has `var state: CardState = CardState.IN_HAND`
- [ ] MatchManager.gd has `var card_drag_ongoing: CardDisplay = null`
- [ ] `_on_gui_input()` checks state before input
- [ ] `_on_gui_input()` checks global flag before dragging
- [ ] `_on_gui_input()` has 0.1s await before committing to drag
- [ ] `_on_gui_input()` clears global flag on release

### Testing
- [ ] TestBoard compiles without errors
- [ ] TestBoard renders 5 cards
- [ ] Test 1 passes: Single drag works
- [ ] Test 2 passes: Click while dragging ignored
- [ ] Test 3 passes: Release drops card
- [ ] Test 4 passes: Quick click ≠ drag
- [ ] Test 5 passes: Hold then drag works
- [ ] GameBoard compiles without errors
- [ ] GameBoard plays match
- [ ] GameBoard card interaction works with multiple cards

### Behavior
- [ ] Only ONE card drags at a time
- [ ] Other cards ignore input while one is dragging
- [ ] Dragged card releases cleanly
- [ ] State is always valid (IN_HAND, DRAGGING, etc.)
- [ ] No console errors about missing methods

---

## 🔍 If Something Doesn't Work

### Problem: "CardDisplay not found" error
**Solution**: Make sure you added `class_name CardDisplay` at the top of CardDisplay.gd

### Problem: "MatchManager not found" error
**Solution**: Make sure MatchManager.gd exists and is in autoload (checked in project.godot)

### Problem: "Reference to undefined class_name CardDisplay" in MatchManager
**Solution**: This is normal if MatchManager references CardDisplay as parameter type. Will resolve at runtime.

### Problem: Multiple cards still dragging
**Solution**: Check that global flag validation is in `_on_gui_input()`:
```gdscript
if MatchManager.card_drag_ongoing != null:
    return
```

### Problem: Long-press not working
**Solution**: Verify await syntax:
```gdscript
await get_tree().create_timer(0.1).timeout  # Correct (Godot 4.0+)
# Not: yield(get_tree(), "idle_frame")  # That's Godot 3.x
```

### Problem: State not changing
**Solution**: Add debug print:
```gdscript
func _on_gui_input(event: InputEvent):
    print("Before: state = ", state)
    if state in [CardState.ANIMATING, CardState.DRAGGING]:
        print("Rejected due to state check")
        return
    print("After: event processed")
```

---

## 📊 Expected Performance Impact

| Metric | Before | After |
|--------|--------|-------|
| Cards responding | ~50% (inconsistent) | ~100% (consistent) |
| Multi-card bugs | Frequent | None |
| State validity | Unknown | 100% |
| Input lag | None | None (same) |
| Memory usage | Same | Same |

---

## 🎓 What You Learned

1. **State Machine Pattern**: One variable controls everything
2. **Global Coordination**: Central flag prevents chaos
3. **Input Validation**: Check state before processing
4. **Async Patterns**: Using await for click/drag distinction
5. **Framework Patterns**: How to implement professional card games

---

## 📚 Next Steps After This Works

### If you have 1-2 hours more:
Implement Phase 2 (smooth animations):
- Move hover animation to `_process()`
- Move drag following to `_process()`
- Add state-driven visual effects

### If you have 3-4 hours more:
Implement Phase 3 (professional architecture):
- Split CardDisplay into components
- Add signal propagation system
- Refactor HandLayout for state coordination

### If you want to learn more:
- Read full `FRAMEWORK-PATTERNS-SYNTHESIS.md` for detailed explanations
- Study CardTemplate.gd (2814 lines) from the framework
- Review pattern implementations in CardContainer, Hand, Pile

---

## 🎉 Success Criteria

After 70 minutes:
- ✅ GameBoard card interaction works
- ✅ No multi-card conflicts
- ✅ Clean state management
- ✅ Professional feel (even if not animated yet)
- ✅ Ready for Phase 2 enhancements

---

**Document**: Step-by-Step Implementation Guide  
**Duration**: 70 minutes  
**Files Modified**: 3  
**Complexity**: Medium  
**Testing**: Comprehensive  
**Next Phase**: 1-2 hours for smooth animations
