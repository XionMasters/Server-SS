import Match from '../models/Match';
import MatchAction from '../models/MatchAction';
import { v4 as uuidv4 } from 'uuid';

// 🎮 Servicios de juego
import { TurnManager } from './game/turnManager';
import { GameStateBuilder } from './game/GameStateBuilder ';

/**
 * GameLogicService
 * 
 * ⚠️ RESPONSABILIDAD: ORQUESTACIÓN PURA
 * 
 * Este servicio NO contiene lógica de juego compleja.
 * Solo orquesta llamadas a servicios especializados:
 * 
 * ✅ Obtiene Match UNA sola vez
 * ✅ Determina playerNumber
 * ✅ Delega a TurnManager todo lo del turno
 * ✅ Delega a GameStateBuilder la serialización
 * ✅ Registra acciones
 * 
 * ❌ NO valida turnos (TurnManager)
 * ❌ NO maneja lógica de cartas (CardManager)
 * ❌ NO ejecuta efectos (EffectsManager)
 */

// ==================== TIPOS ====================

export interface EndTurnResult {
  success: boolean;
  error?: string;
  matchState?: any;
}

// ==================== VALIDACIONES CPSD ====================

/**
 * Valida que el usuario sea jugador en la partida
 * (CPSD Phase 1: Autorización básica)
 */
async function validatePlayerInMatch(
  matchId: string,
  userId: string
): Promise<{ valid: boolean; playerNumber?: 1 | 2; error?: string }> {
  try {
    const match = await Match.findByPk(matchId);
    if (!match) {
      return { valid: false, error: 'Partida no encontrada' };
    }

    const playerNumber = match.player1_id === userId ? 1 : (match.player2_id === userId ? 2 : null);
    if (!playerNumber) {
      return { valid: false, error: 'No eres jugador de esta partida' };
    }

    return { valid: true, playerNumber };
  } catch (error) {
    return { valid: false, error: 'Error validando permiso' };
  }
}

// ==================== CAMBIO DE TURNO (ORQUESTACIÓN) ====================

/**
 * ENDPOINT: Procesa pedido de fin de turno
 * 
 * Flujo CPSD:
 * 1. ✅ Obtiene Match UNA sola vez
 * 2. ✅ Valida permisos básicos (¿es jugador?)
 * 3. ✅ Delega a TurnManager.endTurn() [valida turno + ejecuta]
 * 4. ✅ Construye estado
 * 5. ✅ Registra acción
 * 6. ✅ Retorna resultado
 */
export async function endTurn(
  matchId: string,
  userId: string,
  actionId: string
): Promise<EndTurnResult> {
  try {
    console.log(`🔄 Fin de turno solicitado por ${userId} en match ${matchId}`);

    // 1️⃣ OBTENER MATCH UNA SOLA VEZ
    const match = await Match.findByPk(matchId);
    if (!match) {
      return {
        success: false,
        error: 'Partida no encontrada'
      };
    }

    // 2️⃣ VALIDAR QUE ES JUGADOR (autenticación)
    const authCheck = await validatePlayerInMatch(matchId, userId);
    if (!authCheck.valid) {
      return {
        success: false,
        error: authCheck.error
      };
    }

    const playerNumber = authCheck.playerNumber!;
    console.log(`   📍 Jugador ${playerNumber} termina su turno`);

    // 3️⃣ DELEGAR A TurnManager (valida turno + ejecuta)
    // TurnManager se encarga de:
    // - Validar que sea su turno
    // - Validar que no sea acción duplicada
    // - Cambiar turno
    // - Iniciar turno siguiente
    const turnResult = await TurnManager.endTurn(match, playerNumber, actionId);

    if (!turnResult.success) {
      return {
        success: false,
        error: turnResult.error
      };
    }

    // 4️⃣ CONSTRUIR ESTADO ACTUALIZADO
    const matchState = await GameStateBuilder.buildFromMatch(match);

    // 5️⃣ REGISTRAR ACCIÓN (auditoría)
    await logMatchAction(matchId, playerNumber, 'end_turn', {
      turn_number: match.current_turn,
      next_player: match.current_player
    });

    // 6️⃣ RETORNAR RESULTADO
    console.log(`✅ Turno completado. Próximo jugador: ${match.current_player}`);

    return {
      success: true,
      matchState
    };

  } catch (error: any) {
    console.error('❌ Error en endTurn:', error);
    return {
      success: false,
      error: 'Error procesando fin de turno'
    };
  }
}

// ==================== LOGGING ====================

/**
 * Registra acciones del jugador (auditoría)
 */
async function logMatchAction(
  matchId: string,
  playerNumber: 1 | 2,
  actionType: string,
  actionData: any
): Promise<void> {
  try {
    const actionId = uuidv4();

    await MatchAction.create({
      id: actionId,
      match_id: matchId,
      player_number: playerNumber,
      action_type: actionType,
      action_data: JSON.stringify(actionData),
      created_at: new Date()
    });

    console.log(`   📝 Acción registrada: ${actionType}`);

  } catch (error) {
    console.error('❌ Error registrando acción:', error);
  }
}

// ==================== MÉTODOS PÚBLICOS ====================

/**
 * Obtener estado actual de la partida (sin cambios)
 */
export async function getMatchState(matchId: string): Promise<any | null> {
  try {
    const match = await Match.findByPk(matchId);
    if (!match) return null;

    return await GameStateBuilder.buildFromMatch(match);

  } catch (error) {
    console.error('❌ Error obteniendo estado:', error);
    return null;
  }
}
