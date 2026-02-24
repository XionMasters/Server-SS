-- ============================================
-- PHASE 8.2: SQL VALIDATION QUERIES
-- ============================================
-- Use these queries to validate the processed_actions table
-- and verify idempotency is working correctly

-- 1️⃣ VERIFICAR QUE LA TABLA FUE CREADA
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'processed_actions';

-- Expected output: One row with 'processed_actions'

-- 2️⃣ VER ESTRUCTURA DE LA TABLA
\d processed_actions

-- Expected columns:
-- - id (UUID PRIMARY KEY)
-- - action_id (UUID UNIQUE)
-- - match_id (UUID, FK to matches)
-- - player_number (smallint)
-- - action_type (varchar)
-- - cached_result (jsonb)
-- - created_at (timestamp)
-- - updated_at (timestamp)

-- 3️⃣ VER ÍNDICES CREADOS
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'processed_actions';

-- Expected indices:
-- - idx_action_id (UNIQUE)
-- - idx_match_id
-- - idx_created_at
-- - idx_match_action (compound)

-- 4️⃣ CONTAR ACCIONES PROCESADAS
SELECT COUNT(*) as total_processed_actions 
FROM processed_actions;

-- After tests, this should increase

-- 5️⃣ VER ÚLTIMAS ACCIONES (ÚLTIMAS 10)
SELECT 
  id,
  action_id,
  match_id,
  player_number,
  action_type,
  created_at
FROM processed_actions
ORDER BY created_at DESC
LIMIT 10;

-- 6️⃣ VER ACCIONES POR TIPO (DISTRIBUTION)
SELECT 
  action_type,
  COUNT(*) as count
FROM processed_actions
GROUP BY action_type
ORDER BY count DESC;

-- Expected action_types:
-- - turn_end
-- - card_play
-- - card_discard
-- - card_move
-- - attack
-- - defensive_mode_change

-- 7️⃣ VER ACCIONES DUPLICADAS (IDEMPOTENCIA - DEBERÍA ESTAR VACÍO)
SELECT 
  action_id,
  COUNT(*) as count
FROM processed_actions
GROUP BY action_id
HAVING COUNT(*) > 1;

-- Expected: No rows (cada action_id debe ser ÚNICO)

-- 8️⃣ VER CACHED RESULTS (VERIFICAR QUE ESTÁN GUARDADOS)
SELECT 
  action_id,
  action_type,
  cached_result,
  created_at
FROM processed_actions
WHERE cached_result IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;

-- Expected: cached_result contendrá JSONB con los resultados

-- 9️⃣ VERIFICAR FOREIGN KEY CONSTRAINT
SELECT 
  pa.id,
  pa.action_id,
  pa.match_id,
  m.id as match_exists
FROM processed_actions pa
LEFT JOIN matches m ON pa.match_id = m.id
WHERE m.id IS NULL;

-- Expected: No rows (todas las referencias deben ser válidas)

-- 🔟 VER PERFORMANCE: ACCIONES POR Match
SELECT 
  match_id,
  COUNT(*) as action_count,
  MAX(created_at) as last_action
FROM processed_actions
GROUP BY match_id
ORDER BY action_count DESC
LIMIT 10;

-- 1️⃣1️⃣ VERIFICAR LIMPIEZA AUTOMÁTICA
-- El job de cleanup debería correr cada 24 horas
-- Acciones más viejas de 30 días (configurable)
SELECT 
  COUNT(*) as old_actions
FROM processed_actions
WHERE created_at < NOW() - INTERVAL '30 days';

-- 1️⃣2️⃣ TEST DE DUPLICADO (SIMULAR IDEMPOTENCIA)
-- Ejecutar esta query para verificar que los índices UNIQUE funcionan
-- (esto debería fallar si intentas insertar el mismo action_id)
/*
BEGIN;
INSERT INTO processed_actions (
  id, action_id, match_id, player_number, action_type, cached_result
) VALUES (
  gen_random_uuid(),
  'test-action-id-12345',
  (SELECT id FROM matches LIMIT 1),
  1,
  'turn_end',
  '{"success": true}'::jsonb
);
-- Este segundo INSERT debería fallar:
INSERT INTO processed_actions (
  id, action_id, match_id, player_number, action_type, cached_result
) VALUES (
  gen_random_uuid(),
  'test-action-id-12345',  -- ⚠️ MISMO action_id
  (SELECT id FROM matches LIMIT 1),
  1,
  'turn_end',
  '{"success": true}'::jsonb
);
ROLLBACK;  -- Revertir después de test
*/

-- 1️⃣3️⃣ VER TRIGGERS (TIMESTAMP AUTOMÁTICO)
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE event_object_table = 'processed_actions';

-- Expected trigger: update_processed_actions_updated_at

-- 1️⃣4️⃣ MONITOREAR CRECIMIENTO EN TIEMPO REAL
-- Ejecutar periodicamente durante tests
SELECT 
  action_type,
  COUNT(*) as count,
  MAX(created_at) as last_action,
  ROUND(
    (MAX(created_at)::timestamp - MIN(created_at)::timestamp)::numeric / COUNT(*)::numeric,
    2
  ) AS avg_seconds_between_actions
FROM processed_actions
GROUP BY action_type
ORDER BY last_action DESC;

-- 1️⃣5️⃣ VALIDAR TRANSACCIONES
-- Ver que no hay registros "huérfanos" sin match_id
SELECT COUNT(*)
FROM processed_actions
WHERE match_id IS NULL;

-- Expected: 0 (todos deben tener match_id válido)

-- 1️⃣6️⃣ CLEANUP SIMULATION (SIN EJECUTAR EN PRODUCCIÓN)
-- Ver qué se eliminaría si llamamos la función
SELECT COUNT(*)
FROM processed_actions
WHERE created_at < NOW() - INTERVAL '30 days';

-- Para ejecutar la limpieza:
-- SELECT cleanup_old_processed_actions(30);
