# 🧪 Phase 8.2 Testing Suite - Complete Guide

## 📦 What's in This Folder?

This folder contains a comprehensive testing suite for **Phase 8.2: WebSocket Integration & Idempotency**. 

```
tests/phase8/
├── postman-collection.json              # Postman API tests
├── sql-validation-queries.sql           # Database validation queries
├── sql-migration-setup.sh              # Automated migration setup
├── integration.test.ts                 # Jest integration tests
├── MANUAL-TESTING-CHECKLIST.md         # Step-by-step manual testing
└── README.md                           # This file
```

---

## 🚀 Quick Start (5 minutes)

### 1️⃣ Execute SQL Migration
```bash
# Option A: Linux/Mac
bash tests/phase8/sql-migration-setup.sh

# Option B: Windows PowerShell
cd tests/phase8
./sql-migration-setup.ps1

# Option C: Manual
psql -U postgres -d cg_server -f src/migrations/sql/001_create_processed_actions_table.sql
```

✅ **Expected:** Migration completes, `processed_actions` table created

### 2️⃣ Start WebSocket Server
```bash
npm run dev
# Expected: Server running on ws://localhost:3000
```

### 3️⃣ Import Postman Collection
1. Open Postman
2. Click **Import**
3. Select `postman-collection.json`
4. Click **Import**

✅ **Expected:** 6 test groups imported

### 4️⃣ Set Postman Variables
1. Click **Environments** (top left)
2. Create new environment: `Phase8-Testing`
3. Set these variables:
   - `AUTH_TOKEN`: Your JWT token
   - `MATCH_ID`: Test match UUID
   - `CARD_ID`: Test card UUID (optional)
   - `KNIGHT_ID`: Test knight instance UUID (optional)

### 5️⃣ Run First Test
1. Select "1️⃣ End Turn Test" → "End Turn (No Retry)"
2. Click **Send**
3. Expected response:
```json
{
  "success": true,
  "action_id": "550e8400-e29b-41d4-a716-446655440000",
  "is_retry": false
}
```

✅ **Success!** Phase 8.2 is working

---

## 📋 Comprehensive Testing Paths

### Path 1: Manual Testing (Most Thorough)
**Best for:** First-time validation, troubleshooting

**Time:** ~30-45 minutes

1. Follow `MANUAL-TESTING-CHECKLIST.md` step-by-step
2. Each test is documented line-by-line
3. Database validation included
4. Error case coverage

**Start here if:** You want to understand exactly what's being tested

### Path 2: Postman Testing (Good Balance)
**Best for:** Quick validation, regression testing

**Time:** ~15-20 minutes

1. Import collection into Postman
2. Run tests in order (pre-request scripts auto-generate action_ids)
3. Review test assertions (Tests tab)
4. Check database with SQL queries

**Start here if:** You want fast automated testing

### Path 3: Integration Tests (For CI/CD)
**Best for:** Automated testing, staging/prod validation

**Time:** ~2-5 minutes

```bash
npm test tests/phase8/integration.test.ts
```

**Start here if:** You're setting up automated pipelines

### Path 4: SQL Validation Only (Database Checks)
**Best for:** Database-only verification

**Time:** ~5-10 minutes

1. Open PostgreSQL client
2. Run queries from `sql-validation-queries.sql`
3. Verify each query output

**Start here if:** You need to verify DB state only

---

## 🎯 Key Test Scenarios

### Scenario 1: Idempotency (⭐ CRITICAL)
**Tests that:** Same action_id returns cached result

**Files:** All test files

**Quick Test:**
```sql
-- Send same request twice with identical action_id
-- First: should return is_retry=false
-- Second: should return is_retry=true
```

### Scenario 2: Different action_id (New Execution)
**Tests that:** Different UUIDs trigger new execution

**Files:** All test files

**Quick Test:**
```sql
-- Send 2 requests with different action_ids
-- Both should have is_retry=false
-- Database should have 2 records
```

### Scenario 3: Database Integrity
**Tests that:** No duplicate action_ids exist

**Files:** `sql-validation-queries.sql`

**Quick Test:**
```sql
SELECT action_id, COUNT(*) 
FROM processed_actions
GROUP BY action_id
HAVING COUNT(*) > 1;
-- Expected: No rows (means no duplicates)
```

### Scenario 4: Foreign Key Constraints
**Tests that:** All match_ids reference valid matches

**Files:** `sql-validation-queries.sql`

**Quick Test:**
```sql
SELECT COUNT(*)
FROM processed_actions pa
LEFT JOIN matches m ON pa.match_id = m.id
WHERE m.id IS NULL;
-- Expected: 0 (all references valid)
```

---

## 📄 File Reference Guide

### postman-collection.json
**What it does:** Defines HTTP tests for all 4 WebSocket events

**Includes:**
- ✅ Pre-request scripts (auto-generates UUIDs)
- ✅ Test assertions (validates responses)
- ✅ Environment variables (match_id, action_id, etc.)
- ✅ All 4 handlers (end_turn, play_card, attack, defensive_mode)
- ✅ Error cases

**How to use:**
```
1. Import in Postman
2. Set environment variables
3. Run tests in order
4. Review "Tests" tab for assertions
```

**Key Tests:**
- `1️⃣ WebSocket Connection Test` - Verify WS connection
- `2️⃣ End Turn Test` - Test end_turn idempotency
- `3️⃣ Play Card Test` - Test play_card idempotency
- `4️⃣ Attack Test` - Test attack idempotency
- `5️⃣ Defensive Mode Test` - Test defensive_mode idempotency
- `6️⃣ Database Validation` - Query processed_actions

---

### sql-validation-queries.sql
**What it does:** 16 SQL queries for database validation

**Includes:**
- ✅ Table existence check
- ✅ Structure verification
- ✅ Index validation
- ✅ Constraint verification
- ✅ Data integrity checks
- ✅ Performance queries
- ✅ Idempotency validation
- ✅ Cleanup simulation

**How to use:**
```bash
# Option 1: Copy-paste queries into PostgreSQL client
psql -U postgres -d cg_server

# Option 2: Run entire file
psql -U postgres -d cg_server -f tests/phase8/sql-validation-queries.sql

# Option 3: Save specific results
psql -U postgres -d cg_server -f tests/phase8/sql-validation-queries.sql > validation-results.txt
```

**Key Queries:**
- Query 1️⃣ - Table exists check
- Query 2️⃣ - Structure verification
- Query 3️⃣ - Index list
- Query 7️⃣ - NO DUPLICATES check (⭐ CRITICAL)
- Query 9️⃣ - Foreign key validation
- Query 1️⃣4️⃣ - Duplicate detection test

---

### integration.test.ts
**What it does:** Jest unit tests for all scenarios

**Includes:**
- ✅ 8 test suites
- ✅ 40+ test cases
- ✅ Idempotency coverage
- ✅ Error handling
- ✅ Response format validation
- ✅ Type safety checks
- ✅ Performance assertions
- ✅ Concurrent action testing

**How to use:**
```bash
# Run all Phase 8.2 tests
npm test tests/phase8/integration.test.ts

# Run with coverage
npm test -- --coverage tests/phase8/

# Run specific suite
npm test -- --testNamePattern="Idempotency"

# Watch mode
npm test -- --watch tests/phase8/
```

**Test Suites:**
1. `Idempotency - First Call` - New actions
2. `Idempotency - Retry with Same action_id` - Cached responses
3. `Different action_ids Trigger New Execution` - Action_id variations
4. `Error Handling` - Error cases
5. `Response Format Validation` - Schema checks
6. `Performance Requirements` - Timing tests
7. `Concurrent Action Testing` - Parallel execution
8. `Type Safety` - TypeScript validation

---

### MANUAL-TESTING-CHECKLIST.md
**What it does:** Step-by-step manual testing guide

**Includes:**
- ✅ 8 comprehensive test suites
- ✅ Pre-testing setup
- ✅ Data setup instructions
- ✅ Manual test steps for each scenario
- ✅ Expected results for each step
- ✅ Database validation queries
- ✅ Success criteria
- ✅ Results summary table

**How to use:**
```
1. Read "Pre-Testing Setup"
2. Complete "Test Data Setup"
3. Go through each test suite in order
4. Mark ✅ when each test passes
5. Note observations
6. Complete "Full Test Results Summary"
```

**Best for:**
- Learning the system
- Troubleshooting issues
- Detailed validation
- First-time testers

---

### sql-migration-setup.sh
**What it does:** Automated migration setup with validation

**Features:**
- ✅ Loads .env configuration
- ✅ Tests database connection
- ✅ Checks for existing tables
- ✅ Executes migration
- ✅ Post-migration validation
- ✅ Verifies indices and triggers
- ✅ Color-coded output
- ✅ Error reporting

**How to use:**
```bash
# Linux/Mac
bash tests/phase8/sql-migration-setup.sh

# Windows PowerShell (create sql-migration-setup.ps1 first)
.\sql-migration-setup.ps1
```

**Output:**
```
🔄 Phase 8.2 SQL Migration Setup
==================================
📊 Database Configuration:
   Host: localhost
   Port: 5432
   Database: cg_server
   User: postgres

🔍 Pre-migration checks:
   1. Testing database connection...
   ✓ Database connection successful
   ...
🎉 Phase 8.2 SQL Migration Complete!
```

---

## ⚙️ Integration with WebSocket Handler

### How Tests Connect to Handlers

```
Postman/Jest Test
        ↓
    WebSocket Event
        ↓
websocket.service.ts (messageHandler)
        ↓
    New Handler (REFACTORED)
    ├── handleEndTurnRefactored()
    ├── handlePlayCardRefactored()
    ├── handleAttackRefactored()
    └── handleChangeDefensiveModeRefactored()
        ↓
    TurnManager / CardManager / AttackManager
        ↓
    ProcessedActionsRegistry.find() [CHECK for retry]
        ↓
    Sequelize Transaction
    ├── Lock match
    ├── Map/Validate/Execute
    ├── Persist
    └── Register action
        ↓
    ProcessedActionsRegistry.register() [CACHE result]
        ↓
    Response: {success, is_retry, cached_result}
        ↓
    Postman/Jest Validates
```

---

## 🔍 Troubleshooting

### Issue: Migration fails
**Solution:**
1. Check PostgreSQL is running
2. Verify database credentials in .env
3. Ensure `DB_NAME` exists
4. Run: `psql -U postgres -d cg_server -c "SELECT 1"`

### Issue: Postman tests timeout
**Solution:**
1. Verify server is running: `npm run dev`
2. Check WebSocket is working: `wscat -c ws://localhost:3000?token=YOUR_TOKEN`
3. Verify network: `ping localhost`

### Issue: Tests show `is_retry=false` on retry
**Solution:**
1. Verify action_id is identical (copy-paste, not regenerate)
2. Check database has UNIQUE constraint on action_id
3. Run: `SELECT * FROM pg_indexes WHERE tablename = 'processed_actions'`

### Issue: Database shows duplicate action_ids
**Solution:**
1. UNIQUE constraint not applied correctly
2. Re-run migration: `bash tests/phase8/sql-migration-setup.sh`
3. Check: `SELECT * FROM processed_actions WHERE action_id = 'YOUR_ID'`

### Issue: Foreign key violations
**Solution:**
1. Ensure MATCH_ID is valid: `SELECT * FROM matches WHERE id = 'YOUR_MATCH_ID'`
2. Check match is in correct state
3. Verify CASCADE DELETE references

---

## 📊 Success Criteria Checklist

All of these must be ✅:

- [ ] SQL migration executes without errors
- [ ] `processed_actions` table exists
- [ ] All 4 indices created
- [ ] Trigger for timestamp working
- [ ] End turn test: first call returns `is_retry=false`
- [ ] End turn test: retry returns `is_retry=true` ⭐ CRITICAL
- [ ] Play card test: first call returns `is_retry=false`
- [ ] Play card test: retry uses cached result
- [ ] Attack test: damage value cached correctly
- [ ] Defensive mode test: mode persisted in cache
- [ ] Database shows NO duplicate action_ids
- [ ] All foreign keys valid
- [ ] First call response time < 500ms
- [ ] Retry response time < 100ms
- [ ] Error handling works
- [ ] All response fields present
- [ ] Integration tests pass: `npm test -- --testNamePattern="Phase 8.2"`

---

## 🎓 Learning Resources

### Understanding Idempotency
- Read: [ARCHITECTURE-REFACTOR.md](../docs/ARCHITECTURE-REFACTOR.md) - Section "Idempotency Pattern"
- Watch: How `ProcessedActionsRegistry.find()` works
- Understand: UNIQUE constraint on action_id prevents duplicates

### WebSocket Integration
- Read: Updated `websocket.service.ts` - cases for 4 handlers
- Understand: CPSD pattern (Client Proposes, Server Decides)
- Study: Response format with `is_retry` flag

### Database Design
- Read: `001_create_processed_actions_table.sql`
- Understand: Indices for performance
- Study: JSONB for flexible caching

---

## 📞 Support

**If tests fail:**
1. Check [Troubleshooting](#troubleshooting) section
2. Review test output carefully (look for action_id values)
3. Run database validation queries
4. Check application logs: `npm run dev` (watch for console.log)
5. Verify ProcessedAction model is synced with Sequelize

**Next Steps After Success:**
1. Run Phase 8.3 (Production Validation)
2. Update Godot client to generate action_ids
3. Deploy to staging environment
4. Monitor production metrics

---

## 📝 Test Execution Log

**Keep track of your testing:**

```
Phase 8.2 Testing - Date: 2025-02-23

[ ] Step 1: SQL Migration
    Time: _____ Status: ✅/❌ Notes: _____

[ ] Step 2: WebSocket Server Start
    Time: _____ Status: ✅/❌ Notes: _____

[ ] Step 3: Postman Import
    Time: _____ Status: ✅/❌ Notes: _____

[ ] Step 4: Manual Tests (8 suites)
    Suite 1: _____ Status: ✅/❌
    Suite 2: _____ Status: ✅/❌
    Suite 3: _____ Status: ✅/❌
    ...

[ ] Step 5: Database Validation
    Time: _____ Status: ✅/❌ Notes: _____

[ ] Step 6: Integration Tests
    Command: npm test
    Result: _____ Passed: ___ Failed: ___

Overall Status: ✅ PASS / ❌ NEEDS WORK
```

---

**Last Updated:** 2025-02-23  
**Phase:** 8.2 (WebSocket Integration & Testing)  
**Status:** ✅ Complete & Ready for Testing

