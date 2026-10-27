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
 * 1. Consulta rápida del actionId para reintentos ya confirmados.
 * 2. Lock del match y nueva consulta dentro de la transacción.
 * 3. Persistencia del estado y registro del actionId en la misma transacción.
 * 
 * Tabla SQL: Ver src/migrations/sql/001_create_processed_actions_table.sql
 */

import ProcessedAction from '../models/ProcessedAction';
import { GameState } from '../../../domain/game/GameState';
import { validate as isUuid } from 'uuid';
import { Transaction } from 'sequelize';

interface ProcessedActionLookup {
  transaction?: Transaction;
  matchId?: string;
  playerNumber?: 1 | 2;
  actionType?: string;
}

export class ProcessedActionsRegistry {
  /**
   * Busca si un actionId ya fue procesado
   * Retorna resultado cached si existe
   * 
   * Errores de consulta se propagan para impedir que una acción se aplique
   * cuando no se pudo confirmar su idempotencia.
   * 
   * @param actionId UUID de la acción
   * @returns ProcessedAction | null
   */
  static async find(
    actionId: string,
    { transaction, matchId, playerNumber, actionType }: ProcessedActionLookup = {},
  ): Promise<ProcessedAction | null> {
    if (!isUuid(actionId)) {
      throw new Error('action_id debe ser un UUID válido');
    }

    const processed = await ProcessedAction.findOne({
      where: { action_id: actionId },
      transaction,
    });

    if (!processed) return null;

    if (
      (matchId !== undefined && processed.match_id !== matchId) ||
      (playerNumber !== undefined && processed.player_number !== playerNumber) ||
      (actionType !== undefined && processed.action_type !== actionType)
    ) {
      throw new Error('action_id ya fue utilizado para otra acción');
    }

    console.log(`[Registry] Acción ${actionId} encontrada en cache, retornando resultado`);
    return processed;
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
