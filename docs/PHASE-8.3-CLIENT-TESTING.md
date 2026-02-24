# Phase 8.3: Godot Client Integration Testing

**Status**: 🟡 BLOCKED WAITING FOR CLIENT  
**Server Status**: 🟢 RUNNING AND READY

---

## What's Ready for Testing

### Server-Side
✅ WebSocket Server running on `ws://localhost:3000`  
✅ 4 Main handlers implemented:
- `end_turn` → TurnManager.endTurn()
- `play_card` → CardManager.playCard()  
- `declare_attack` → AttackManager.attack()
- `change_defensive_mode` → AttackManager.changeDefensiveMode()

✅ Idempotency working:
- First call: `is_retry = false`, result cached
- Retry with same `action_id`: `is_retry = true`, cached result returned

✅ Database layer ready:
- PostgreSQL 18 running
- `processed_actions` table created
- Migrations applied

---

## Client-Side Checklist (Godot - ccg/)

### 1. **UUID Generation** ⏳  
```gdscript
# In WebSocketManager or GameBoard
var action_id = str(UUID.v4())  # Generate unique ID for each action
```

### 2. **End Turn Implementation** ⏳
```gdscript
# Current: probably sends directly
# New: should include action_id

var data = {
  "match_id": current_match.id,
  "action_id": action_id  # <- ADD THIS
}
WebSocketManager.send_event("end_turn", data)
```

### 3. **Play Card Implementation** ⏳
```gdscript
var data = {
  "match_id": current_match.id,
  "card_id": card.id,
  "zone": "field_knight",  # or other zone
  "position": 0,  # slot index
  "action_id": action_id  # <- ADD THIS
}
WebSocketManager.send_event("play_card", data)
```

### 4. **Attack Implementation** ⏳
```gdscript
var data = {
  "match_id": current_match.id,
  "attacker_id": attacker_card.id,
  "defender_id": defender_card.id,
  "action_id": action_id  # <- ADD THIS
}
WebSocketManager.send_event("declare_attack", data)
```

### 5. **Defensive Mode Implementation** ⏳
```gdscript
var data = {
  "match_id": current_match.id,
  "knight_id": card.id,  # card to change mode
  "mode": "defense",  # or "normal", "evasion"
  "action_id": action_id  # <- ADD THIS
}
WebSocketManager.send_event("change_defensive_mode", data)
```

### 6. **Response Handling** ⏳
```gdscript
# On event received (e.g., "turn_ended")
func _on_turn_ended(data: Dictionary):
  if data.get("is_retry"):
    # This was a retry - don't process twice
    print("Retry detected, skipping duplicate processing")
    return
  
  # First call - process normally
  # Update UI, refresh game state, etc.
  var new_state = data.get("cached_result")
  render_game_state(new_state)
```

---

## Retry Logic (Critical for Reliability)

### Problem
- User performs action
- Network packet loss
- User retries (clicks button again)
- Action executes twice = game breaking

### Solution: Idempotency
```
First Call:
  action_id = "550e8400-e29b-41d4-a716-446655440000"
  Response: { success: true, is_retry: false, cached_result: {...} }
  Server: Executes action, saves result to DB

Retry (same action_id):
  action_id = "550e8400-e29b-41d4-a716-446655440000"
  Response: { success: true, is_retry: true, cached_result: {...SAME...} }
  Server: Returns cached result WITHOUT executing again
```

---

## Testing Scenario

### Setup
1. Client connects to `ws://localhost:3000`
2. Create test match (or use existing match ID)
3. Send first action with `action_id`

### Test Case 1: Single Action
```gdscript
var action_id = "test-uuid-001"
call_action("end_turn", action_id)
# Expect: is_retry = false
```

### Test Case 2: Retry Same Action
```gdscript
var action_id = "test-uuid-001"
call_action("end_turn", action_id)  # First time
# Wait 1 second
call_action("end_turn", action_id)  # Retry with SAME ID
# Expect: is_retry = true
# Expect: SAME cached_result as first call
```

### Test Case 3: New Action
```gdscript
var action_id = "test-uuid-002"  # DIFFERENT ID
call_action("end_turn", action_id)
# Expect: is_retry = false
# Expect: NEW result (different from test-uuid-001)
```

---

## Expected Response Format

### Success Response
```json
{
  "success": true,
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_retry": false,
  "cached_result": {
    "newState": {
      "player1_life": 20,
      "player1_cosmos": 5,
      "currentTurn": 4,
      "currentPlayer": 2
    }
  }
}
```

### Retry Response  
```json
{
  "success": true,
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_retry": true,
  "cached_result": {
    "newState": {
      "player1_life": 20,
      "player1_cosmos": 5,
      "currentTurn": 4,
      "currentPlayer": 2
    }
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Match not found",
  "code": "MATCH_NOT_FOUND"
}
```

---

## UUID Library Options for Godot

### Option 1: GDScript Built-in (4.1+)
```gdscript
var action_id = str(UUID.v4())
```

### Option 2: Use Existing UUID
If your project already has UUID generation (probably in WiFiManager or similar):
```gdscript
var action_id = generate_uuid()  # Use project's existing function
```

### Option 3: Quick Implementation
```gdscript
func generate_uuid() -> String:
  return "%04x%04x-%04x-%04x-%04x-%04x%04x%04x" % [
    randi() % 0x10000, randi() % 0x10000,
    randi() % 0x10000,
    randi() % 0x4000 + 0x8000,
    randi() % 0x10000,
    randi() % 0x10000, randi() % 0x10000, randi() % 0x10000
  ]
```

---

## Critical Modifications Required in Godot

### File: `scripts/managers/WebSocketManager.gd`
```gdscript
# Current: Probably sends action directly
# Required: Track action_id and handle is_retry
```

### File: `scenes/game/GameBoard.gd`
```gdscript
# Current: Probably calls handlers directly
# Required: Generate action_id for each user action
# Required: Check is_retry before updating state
```

### Example Flow
```gdscript
# GameBoard.gd
func _on_end_turn_button_pressed():
  var action_id = str(UUID.v4())  # Generate unique ID
  var data = {
    "match_id": current_match.id,
    "action_id": action_id
  }
  WebSocketManager.send("end_turn", data)

# WebSocketManager.gd
func _on_event_received(event: String, data: Dictionary):
  if event == "turn_ended":
    if data.get("is_retry"):
      print("Duplicate action, ignoring...")
      return
    # Process normally  
    GameBoard.handle_turn_ended(data)
```

---

## Performance Expectations

- **First Action**: ~50-100ms (hit DB, cache result)
- **Retry Action**: ~5-10ms (return from cache)
- **Network Latency**: +20-50ms depending on connection

---

## Database State After Testing

### `processed_actions` table
```sql
SELECT action_id, match_id, player_number, action_type, is_cached 
FROM processed_actions 
ORDER BY created_at DESC 
LIMIT 10;
```

Expected: One row per unique `action_id`, no duplicates

---

## Debugging Checklist

- [ ] Server shows `✅ Turno terminado exitosamente` in logs
- [ ] `is_retry: false` on first call
- [ ] `is_retry: true` on retry with same `action_id`
- [ ] No database errors in PostgreSQL logs
- [ ] WebSocket connection stays open across multiple actions
- [ ] Memory usage stable (~100 MB)

---

## Success Criteria

✅ Client sends action with `action_id`  
✅ Server processes without type errors  
✅ Response includes `is_retry` flag  
✅ Retry with same ID returns cached result  
✅ Database grows with new actions, not retries  
✅ Game state updates correctly shown

---

**Blocking Issue**: Godot client modifications not yet implemented  
**Next Phase**: Integrate UUID generation and action_id tracking in Godot  
**Estimated Time**: 2-4 hours for full client integration
