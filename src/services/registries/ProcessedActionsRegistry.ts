/**
 * ProcessedActionsRegistry.ts
 * 
 * Servicio para rastrear acciones ya procesadas.
 * Esto garantiza IDEMPOTENCIA verdadera.
 * 
 * Responsabilidades:
 * ✅ Chequear si un actionId ya fue procesado (find)
 * ✅ Registrar una acción como procesada (register)
 * ✅ Cachear resultado para reintentos
 * 
 * Flujo:
 * 1. TurnManager.endTurn(match, playerNumber, actionId)
 * 2. ANTES de transacción: ProcessedActionsRegistry.find(actionId)
 *    - Si existe: return cached_result
 *    - Si no: proceder normalmente
 * 3. DENTRO de transacción: ProcessedActionsRegistry.register(actionId, ...)
 * 
 * Tabla SQL: Ver src/migrations/sql/001_create_processed_actions_table.sql
 */

import ProcessedAction from '../../models/ProcessedAction';
import { GameState } from '../../engine/GameState';
import { validate as isUuid } from 'uuid';

export class ProcessedActionsRegistry {
  /**
   * Busca si un actionId ya fue procesado
   * Retorna resultado cached si existe
   * 
   * ⚠️ CRÍTICO: Esta llamada es ANTES de transacción
   * - Si encuentra: retorna inmediatamente (sin lock, sin recalcular)
   * - Si no encuentra: null (continúa a transacción)
   * 
   * @param actionId UUID de la acción
   * @returns ProcessedAction | null
   */
  static async find(actionId: string): Promise<ProcessedAction | null> {
    if (!isUuid(actionId)) {
      console.warn(`[Registry] actionId inválido (no UUID): ${actionId}`);
      return null; // evita query inválida a Postgres
    }

    try {
      const processed = await ProcessedAction.findOne({
        where: { action_id: actionId },
      });

      if (processed) {
        console.log(`[Registry] Acción ${actionId} encontrada en cache, retornando resultado`);
      }

      return processed;
    } catch (error) {
      console.error('[Registry] Error en find:', error);
      return null; // Si hay error, proceder (mejor safe than sorry)
    }
  }

  /**
   * Registra una acción como procesada
   * Cachea el resultado para próximos reintentos
   * 
   * ⚠️ CRÍTICO: Esta llamada es DENTRO de la transacción
   * Si falla, transacción se rollback
   * 
   * @param actionId UUID de la acción
   * @param matchId UUID del match
   * @param playerNumber Jugador que hizo la acción
   * @param cachedResult Estado resultante (GameState u otro)
   * @param actionType Tipo de acción (turn_end, card_play, etc)
   * @param transaction Transacción Sequelize
   */
  static async register(
    actionId: string,
    matchId: string,
    playerNumber: 1 | 2,
    cachedResult: any,
    actionType: string = 'unknown',
    transaction?: any
  ): Promise<void> {
    try {
      // Crear nuevo registro
      // actionId es UNIQUE, así que duplicados lanzan error (intencional)
      await ProcessedAction.create(
        {
          action_id: actionId,
          match_id: matchId,
          player_number: playerNumber,
          action_type: actionType,
          cached_result: cachedResult,
        },
        { transaction }
      );

      console.log(`[Registry] Acción ${actionId} registrada como procesada`);
    } catch (error) {
      console.error('[Registry] Error en register:', error);
      throw error; // Propagar para rollback de transacción
    }
  }

  /**
   * (FUTURO) Limpiar acciones antiguas para no llenar tabla
   * Por ejemplo, borrar acciones de hace 7 días
   */
  static async cleanup() {
    try {
      const ProcessedActionModel = (global as any).ProcessedAction;
      
      if (ProcessedActionModel) {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        await ProcessedActionModel.destroy({
          where: {
            created_at: { [require('sequelize').Op.lt]: sevenDaysAgo },
          },
        });
      }
    } catch (error) {
      console.error('Error en ProcessedActionsRegistry.cleanup:', error);
    }
  }
}

/**
 * SQL para crear tabla processed_actions:
 * 
 * CREATE TABLE processed_actions (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   action_id UUID UNIQUE NOT NULL,
 *   match_id UUID NOT NULL,
 *   player_number SMALLINT NOT NULL,
 *   action_type VARCHAR(50),
 *   cached_result JSONB,
 *   created_at TIMESTAMP DEFAULT NOW(),
 *   updated_at TIMESTAMP DEFAULT NOW(),
 *   
 *   FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
 * );
 * 
 * CREATE INDEX idx_action_id ON processed_actions(action_id) UNIQUE;
 * CREATE INDEX idx_match_id ON processed_actions(match_id);
 */
