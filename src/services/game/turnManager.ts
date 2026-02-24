/**
 * TurnManager.ts
 * 
 * Orquestación transaccional del final de turno.
 * 
 * Responsabilidades:
 * ✅ Idempotencia (check antes de transacción)
 * ✅ Lock de fila (pessimistic locking)
 * ✅ Validación de reglas
 * ✅ Ejecución de reglas
 * ✅ Persistencia atómica
 * ✅ Cacheo de resultado
 * 
 * FLUJO CRÍTICO:
 * 
 * 0. ProcessedActionsRegistry.find(actionId)
 *    └─ Si existe: retorna cached result (ANTES de lock)
 * 
 * 1. sequelize.transaction(async (t) => {
 *      2. match.reload({ lock: t.LOCK.UPDATE, transaction: t })
 *         └─ Usa pessimistic locking: impide que otro proceso modifique
 *      
 *      3. const currentState = MatchStateMapper.fromMatch(match)
 *         └─ Mapea estado de BD a GameState (puro)
 *      
 *      4. const validation = TurnRulesEngine.validateEndTurn(currentState, playerNumber)
 *         └─ Valida reglas (sin mutación)
 * 
 *      5. const result = TurnRulesEngine.endTurn(currentState, playerNumber)
 *         └─ Calcula nuevo estado (sin mutación)
 * 
 *      6. MatchRepository.applyState(match, result.newState, t)
 *         └─ Aplica cambios al modelo Match
 *         └─ Guarda con transacción
 * 
 *      7. ProcessedActionsRegistry.register(actionId, match.id, playerNumber, result, t)
 *         └─ Cachea resultado para próximos reintentos
 *         └─ Si falla: rollback automático
 *    })
 * 
 * 8. return result
 *    └─ Retorna nuevo estado a WebSocket
 */

import { sequelize } from '../../config/database';
import Match from '../../models/Match';
import { TurnRulesEngine } from '../../engine/TurnRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';

export class TurnManager {
  /**
   * Finaliza el turno de un jugador
   * 
   * @param match Match object del BD
   * @param playerNumber 1 o 2
   * @param actionId UUID para idempotencia
   * @returns Nuevo estado de juego + metadata
   */
  static async endTurn(
    match: any,
    playerNumber: 1 | 2,
    actionId: string
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // ========================================================================
      // PASO 0️⃣: IDEMPOTENCIA CHECK (ANTES de transacción - CRÍTICO)
      // ========================================================================
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[TurnManager] Acción ${actionId} ya procesada (retry), retornando resultado cached`);
        return {
          success: true,
          newState: cached.cached_result,
          isRetry: true,
        };
      }

      // ========================================================================
      // PASO 1: TRANSACCIÓN CON LOCK (pessimistic)
      // ========================================================================
      const result = await sequelize.transaction(
        async (transaction) => {
          // ====================================================================
          // PASO 2: LOCK DE FILA
          // ====================================================================
          await match.reload({
            lock: transaction.LOCK.UPDATE,
            transaction,
          });

          // ====================================================================
          // PASO 3: MAPEAR A ESTADO PURO
          // ====================================================================
          const currentState = MatchStateMapper.fromMatch(match);

          // ====================================================================
          // PASO 4: VALIDAR REGLAS
          // ====================================================================
          const validation = TurnRulesEngine.validateEndTurn(currentState, playerNumber);
          if (!validation.valid) {
            throw new Error(validation.error || 'Validación fallida');
          }

          // ====================================================================
          // PASO 5: EJECUTAR REGLAS (puro, sin mutación)
          // ====================================================================
          const execution = TurnRulesEngine.endTurn(currentState, playerNumber);
          if (!execution.newState) {
            throw new Error('Error al ejecutar reglas de turno');
          }

          // ====================================================================
          // PASO 6: APLICAR CAMBIOS AL MODELO DE BD
          // ====================================================================
          await MatchRepository.applyState(match, execution.newState, transaction);

          // ====================================================================
          // PASO 7: REGISTRAR COMO PROCESADA (idempotencia)
          // ====================================================================
          await ProcessedActionsRegistry.register(
            actionId,
            match.id,
            playerNumber,
            execution.newState,
            'turn_end',  // actionType
            transaction
          );

          return execution.newState;
        }
      );

      return {
        success: true,
        newState: result,
      };
    } catch (error) {
      console.error('[TurnManager] Error en endTurn:', error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  /**
   * (FUTURO) Simular final de turno sin persistir
   * Útil para UI predicción o pruebas
   */
  static async simulateEndTurn(match: any, playerNumber: 1 | 2) {
    try {
      const currentState = MatchStateMapper.fromMatch(match);
      const result = TurnRulesEngine.endTurn(currentState, playerNumber);
      return result;
    } catch (error) {
      console.error('[TurnManager] Error simulando turno:', error);
      return { newState: null };
    }
  }

  /**
   * (FUTURO) Deshacer último turno (si implementamos historial)
   * Requeriría tabla turn_history
   */
  static async undoTurn(match: any) {
    // TODO: Implementar si se requiere
  }
}

/**
 * NOTAS DE IMPLEMENTACIÓN:
 * 
 * 1. ISOLATION_LEVELS.SERIALIZABLE es más lento pero garantiza
 *    que ningun otro proceso puede leer / modificar durante transacción.
 *    Si performance es problema, cambiar a REPEATABLE_READ.
 * 
 * 2. Pessimistic locking (transaction.LOCK.UPDATE) es para MySQL.
 *    PostgreSQL usa SELECT ... FOR UPDATE.
 * 
 * 3. Todas las excepciones dentro de transacción causarán rollback automático.
 *    Por eso throw en paso 4 / 5 es seguro - no persiste nada.
 * 
 * 4. ProcessedActionsRegistry.register es ADENTRO de transacción,
 *    así si falla, todo se rollback (inclusive el registro).
 *    Si queremos hacer registro "best effort", mover fuera de transacción.
 * 
 * 5. actionId DEBE ser UUID único generado por cliente.
 *    Cliente debe usar mismo actionId en reintentos.
 * 
 * 6. Para PvP: si dos jugadores hacen endTurn simultáneamente,
 *    solo uno logrará lock. El otro esperará (o timeout si está configurado).
 *    Segundo conseguirá nueva lectura de estado actualizado.
 */
