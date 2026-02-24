# 🧪 Phase 8.2 - Manual Testing Checklist

## 📋 Pre-Testing Setup

### ✅ Prerequisites
- [ ] SQL Migration executed (`001_create_processed_actions_table.sql`)
- [ ] ProcessedAction model synchronized with Sequelize
- [ ] WebSocket handlers imported in `websocket.service.ts`
- [ ] Message handler updated with 4 cases
- [ ] Node.js server running: `npm run dev`
- [ ] Postman collection imported: `postman-collection.json`
- [ ] Database connection verified
- [ ] Authentication token ready

### 📝 Test Data Setup
- [ ] Create a test match or use existing one
- [ ] Get MATCH_ID from database
- [ ] Get test user IDs (player 1 & 2)
- [ ] Have at least 2 test cards ready
- [ ] Have Knight instances to test attacks

---

## 🎬 TEST SUITE 1: Basic Connectivity

### 1.1 WebSocket Connection
**Action:** Connect to WebSocket with token
```bash
wscat -c ws://localhost:3000?token=YOUR_JWT_TOKEN
```

**Expected Results:**
- [ ] Connection accepted (101 Switching Protocols)
- [ ] Receive `connected` event with user_id and username
- [ ] Socket stays open for communication

**Test Command:**
```
Listen for message: {"event":"connected","data":{...}}
```

---

## 🎯 TEST SUITE 2: End Turn Idempotency Test

### 2.1 First Call (No Retry)
**What we test:** Initial end_turn action creates new record

**Manual Steps:**
1. [ ] Open Postman → Select "End Turn (No Retry)" request
2. [ ] Set {{MATCH_ID}} variable
3. [ ] Click "Send"
4. [ ] Verify response:
   ```json
   {
     "success": true,
     "action_id": "123e4567-e89b-12d3-a456-426614174000",
     "is_retry": false,
     "message": "Turno terminado"
   }
   ```

**Database Validation:**
```sql
-- Run on PostgreSQL:
SELECT * FROM processed_actions 
WHERE action_type = 'turn_end' 
ORDER BY created_at DESC LIMIT 1;

-- Should show: is_retry=false, action saved
```

✅ **Pass Criteria:**
- Response has `success=true`
- Response has `is_retry=false`
- Response has `action_id`
- Database has 1 new record

### 2.2 Second Call (SAME action_id - RETRY TEST) ⭐ CRITICAL
**What we test:** Sending same action_id returns cached result

**Manual Steps:**
1. [ ] Copy the `action_id` from response 2.1
2. [ ] Modify Postman body to use SAME action_id:
   ```json
   {
     "event": "end_turn",
     "data": {
       "match_id": "{{MATCH_ID}}",
       "action_id": "123e4567-e89b-12d3-a456-426614174000"  // SAME!
     }
   }
   ```
3. [ ] Click "Send" in Postman
4. [ ] Verify response:
   ```json
   {
     "success": true,
     "action_id": "123e4567-e89b-12d3-a456-426614174000",
     "is_retry": true,  // ⭐ CRITICAL
     "cached_result": {
       "success": true,
       "message": "Turno terminado"
     }
   }
   ```

**Database Validation:**
```sql
-- THIS QUERY SHOULD RETURN NO ROWS (unique constraint works):
SELECT action_id, COUNT(*)
FROM processed_actions
WHERE action_id = 'YOUR_ACTION_ID'
GROUP BY action_id
HAVING COUNT(*) > 1;

-- Should show no results (no duplicates!)
```

✅ **Pass Criteria:**
- Response has `is_retry=true` ⭐ CRITICAL
- `action_id` is identical to first call
- `cached_result` is included
- **NO new database record created**
- Database still has only 1 record for this action_id

### 2.3 Third Call (NEW action_id - New Execution)
**What we test:** Different action_id triggers new execution

**Manual Steps:**
1. [ ] Generate NEW action_id (UUID)
2. [ ] Send request with new action_id:
   ```json
   {
     "event": "end_turn",
     "data": {
       "match_id": "{{MATCH_ID}}",
       "action_id": "99999999-9999-9999-9999-999999999999"  // DIFFERENT!
     }
   }
   ```
3. [ ] Verify response has `is_retry=false`

✅ **Pass Criteria:**
- Response has `is_retry=false`
- **NEW** database record created
- Database now has 2 records for this match

---

## 🃏 TEST SUITE 3: Play Card Idempotency

### 3.1 Play Card (First Time)
**Manual Steps:**
1. [ ] Set CARD_ID variable
2. [ ] Set POSITION (0-4)
3. [ ] Generate action_id
4. [ ] Send play_card request
5. [ ] Expect: `is_retry=false`

**Database:**
```sql
SELECT * FROM processed_actions 
WHERE action_type = 'card_play' 
ORDER BY created_at DESC LIMIT 1;
```

✅ **Pass Criteria:**
- `is_retry=false`
- Database has new record

### 3.2 Play Card (RETRY - Same action_id)
**Manual Steps:**
1. [ ] Copy action_id from 3.1
2. [ ] Send same request with same action_id
3. [ ] Expect: `is_retry=true`

✅ **Pass Criteria:**
- `is_retry=true` 
- Response contains `cached_result`
- No new database record

---

## ⚔️ TEST SUITE 4: Attack Idempotency

### 4.1 Attack (First Time)
**Manual Steps:**
1. [ ] Set ATTACKER_ID (knight instance ID)
2. [ ] Set DEFENDER_ID (opponent knight instance ID)
3. [ ] Generate action_id
4. [ ] Send declare_attack request
5. [ ] Save response damage: `damage=5` (example)

**Response Example:**
```json
{
  "success": true,
  "action_id": "attack-uuid",
  "is_retry": false,
  "damage": 5
}
```

✅ **Pass Criteria:**
- `is_retry=false`
- `damage` value returned
- Database record created

### 4.2 Attack (RETRY - Same Damage)
**Manual Steps:**
1. [ ] Send same request with same action_id
2. [ ] Expect same damage value: `damage=5`
3. [ ] Expect `is_retry=true`

✅ **Pass Criteria:**
- `damage` value identical to first call
- `is_retry=true`
- Proves deterministic behavior from cache

---

## 🛡️ TEST SUITE 5: Defensive Mode Idempotency

### 5.1 Change to Defense Mode
**Manual Steps:**
1. [ ] Set KNIGHT_ID
2. [ ] Set mode: `"defense"`
3. [ ] Generate action_id
4. [ ] Send change_defensive_mode request

**Response Example:**
```json
{
  "success": true,
  "action_id": "def-uuid",
  "is_retry": false,
  "mode": "defense"
}
```

✅ **Pass Criteria:**
- `is_retry=false`
- `mode="defense"`
- Database record created

### 5.2 Change to Evasion Mode
**Steps:** Same as 5.1 but with `mode="evasion"`

### 5.3 Retry Defensive Mode (SAME action_id)
**Manual Steps:**
1. [ ] Retry with same action_id from 5.1
2. [ ] Expect same mode value
3. [ ] Expect `is_retry=true`

✅ **Pass Criteria:**
- `mode` value identical
- `is_retry=true`

---

## 💾 TEST SUITE 6: Database Validation

### 6.1 Table Exists
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'processed_actions';
```
✅ **Expected:** One row

### 6.2 Check Indices
```sql
SELECT indexname FROM pg_indexes 
WHERE tablename = 'processed_actions';
```
✅ **Expected:** 4 indices (idx_action_id, idx_match_id, idx_created_at, idx_match_action)

### 6.3 Unique Constraint Works
```sql
-- After running all tests above, this should show distribution:
SELECT action_type, COUNT(*) as count
FROM processed_actions
GROUP BY action_type;

-- Should show: turn_end, card_play, attack, defensive_mode_change
```

### 6.4 No Duplicates
```sql
-- THIS SHOULD RETURN NO ROWS (meaning no duplicates):
SELECT action_id, COUNT(*) 
FROM processed_actions
GROUP BY action_id
HAVING COUNT(*) > 1;
```
✅ **Expected:** No rows

### 6.5 Verify Foreign Keys
```sql
SELECT COUNT(*)
FROM processed_actions pa
LEFT JOIN matches m ON pa.match_id = m.id
WHERE m.id IS NULL;
```
✅ **Expected:** 0 (all references valid)

---

## ⏱️ TEST SUITE 7: Performance Validation

### 7.1 Response Time - First Call
**What we measure:** Time for first execution

**Steps:**
1. [ ] note start time
2. [ ] Send new action request
3. [ ] Note end time
4. [ ] Calculate: end - start

✅ **Pass Criteria:** < 500ms (acceptable for first execution)

### 7.2 Response Time - Retry Call
**What we measure:** Time for cached response

**Steps:**
1. [ ] Note start time
2. [ ] Send same action_id request (retry)
3. [ ] Note end time

✅ **Pass Criteria:** < 100ms (should be fast - cached!)

---

## ❌ TEST SUITE 8: Error Cases

### 8.1 Invalid Match ID
**Request:**
```json
{
  "event": "end_turn",
  "data": {
    "match_id": "invalid-uuid",
    "action_id": "..."
  }
}
```

✅ **Expected:** `success=false`, `error` message

### 8.2 User Not in Match
**What we test:** Prevent unauthorized players

✅ **Expected:** `success=false`

### 8.3 Invalid Data Format
**Request:** Omit required field

✅ **Expected:** `success=false`, validation error

---

## 📊 Full Test Results Summary

### Fill this after completing all tests:

| Test | Status | Notes |
|------|--------|-------|
| WebSocket Connection | ✅/❌ | |
| End Turn First Call | ✅/❌ | |
| End Turn Retry (CRITICAL) | ✅/❌ | is_retry=true? |
| End Turn New Action | ✅/❌ | is_retry=false? |
| Play Card First | ✅/❌ | |
| Play Card Retry | ✅/❌ | |
| Attack First | ✅/❌ | damage cached? |
| Attack Retry | ✅/❌ | same damage? |
| Defensive First | ✅/❌ | |
| Defensive Retry | ✅/❌ | |
| DB - No Duplicates | ✅/❌ | UNIQUE constraint? |
| DB - Foreign Keys | ✅/❌ | all valid? |
| Performance < 500ms | ✅/❌ | |
| Performance Retry < 100ms | ✅/❌ | |
| Error Handling | ✅/❌ | |

---

## 🎯 Success Criteria - ALL MUST PASS

- [ ] ⭐ Idempotency works: Same action_id returns is_retry=true
- [ ] ⭐ New actions execute: Different action_id returns is_retry=false
- [ ] ⭐ Database has no duplicates: UNIQUE constraint on action_id
- [ ] ⭐ Response format correct: All responses have required fields
- [ ] ⭐ Performance acceptable: First < 500ms, Retry < 100ms
- [ ] ⭐ Error handling: Invalid requests properly rejected

---

## 🚀 Next Steps After Passing

1. [ ] Run automated tests: `npm test tests/phase8/`
2. [ ] Update Godot client to generate action_ids
3. [ ] Deploy to staging environment
4. [ ] Run Phase 8.3 (Production Validation)

---

**Last Updated:** 2025-02-23
**Phase:** 8.2 (Integration & Testing)
