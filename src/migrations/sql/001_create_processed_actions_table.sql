/**
 * 001_create_processed_actions_table.sql
 * 
 * Migration para crear tabla de acciones procesadas (idempotencia)
 * 
 * Ejecutar con:
 * psql -U [user] -d [database] -f src/migrations/sql/001_create_processed_actions_table.sql
 */

-- ========================================================================
-- Crear tabla processed_actions (idempotencia registry)
-- ========================================================================

CREATE TABLE IF NOT EXISTS processed_actions (
  -- Identificadores
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id UUID UNIQUE NOT NULL,
  match_id UUID NOT NULL,
  
  -- Contexto
  player_number SMALLINT NOT NULL CHECK (player_number IN (1, 2)),
  action_type VARCHAR(50) NOT NULL,
  
  -- Caching del resultado
  cached_result JSONB,
  
  -- Auditoría
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Relación con matches
  CONSTRAINT fk_match_id 
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

-- ========================================================================
-- Índices para performance
-- ========================================================================

-- Index único en action_id (garantiza unicidad para idempotencia)
CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_actions_action_id 
  ON processed_actions(action_id);

-- Index en match_id para queries rápidas
CREATE INDEX IF NOT EXISTS idx_processed_actions_match_id 
  ON processed_actions(match_id);

-- Index en created_at para cleanup (borrar registros viejos)
CREATE INDEX IF NOT EXISTS idx_processed_actions_created_at 
  ON processed_actions(created_at);

-- Index compuesto: (match_id, action_type) para búsquedas específicas
CREATE INDEX IF NOT EXISTS idx_processed_actions_match_action
  ON processed_actions(match_id, action_type);

-- ========================================================================
-- Comentarios de documentación
-- ========================================================================

COMMENT ON TABLE processed_actions IS 
'Tabla para rastrear acciones ya procesadas. Garantiza IDEMPOTENCIA verdadera.
Permite reintentos seguros en PvP sin race conditions.';

COMMENT ON COLUMN processed_actions.action_id IS 
'UUID único de la acción. El cliente debe generar y reutilizar en reintentos.';

COMMENT ON COLUMN processed_actions.match_id IS 
'Referencia al match donde ocurrió la acción.';

COMMENT ON COLUMN processed_actions.player_number IS 
'Jugador que ejecutó la acción (1 o 2).';

COMMENT ON COLUMN processed_actions.action_type IS 
'Tipo de acción: turn_end, card_play, attack, mode_change, etc.';

COMMENT ON COLUMN processed_actions.cached_result IS 
'Resultado cacheado de la acción. Retornado en reintentos para consistencia.';

-- ========================================================================
-- Trigger para actualizar updated_at automáticamente
-- ========================================================================

CREATE OR REPLACE FUNCTION update_processed_actions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_processed_actions_updated_at
BEFORE UPDATE ON processed_actions
FOR EACH ROW
EXECUTE FUNCTION update_processed_actions_timestamp();

-- ========================================================================
-- Script de limpieza (opcional) - ejecutar periódicamente
-- ========================================================================

-- Para eliminar acciones de hace + de 7 días:
-- DELETE FROM processed_actions WHERE created_at < NOW() - INTERVAL '7 days';

-- O crear una función:
CREATE OR REPLACE FUNCTION cleanup_old_processed_actions(days_to_keep INT DEFAULT 7)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM processed_actions 
  WHERE created_at < NOW() - (days_to_keep || ' days')::INTERVAL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ========================================================================
-- Verificación post-creación
-- ========================================================================

-- Verificar que la tabla existe y tiene estructura correcta:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'processed_actions' 
-- ORDER BY ordinal_position;

-- Verificar que todos los índices fueron creados:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'processed_actions';
