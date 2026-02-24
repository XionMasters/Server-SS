/**
 * websocket-integrations.ts
 * 
 * Nuevos handlers para WebSocket que delegan a Coordinators.
 * 
 * Reemplaza handlers viejos en websocket.service.ts de manera gradual.
 * CPSD Pattern:
 * - Phase 1 (Cliente): Cliente propone acciÃ³n
 * - Phase 2 (Server): Servidor valida contexto (COORDINATORS)
 * - Phase 3 (Server): Servidor ejecuta reglas (RULES ENGINES)
 * - Phase 4 (Cliente): Cliente recibe confirmaciÃ³n
 */

import { v4 as uuidv4 } from 'uuid';
import { TurnManager, CardManager, AttackManager } from '../services/game';
import { MatchCoordinator, MatchesCoordinator } from '../services/coordinators';
import Match from '../models/Match';

interface AuthenticatedWebSocket {    userId?: string;
  username?: string;  isAlive?: boolean;
  isAdmin?: boolean;
  isSearchingMatch?: boolean;
}

function sendEvent(ws: any, event: string, data: any = {}) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ event, data }));
  }
}

/**
 * REFACTORIZADO: endTurn handler delegando a arquitectura nueva
 * 
 * Flujo:
 * 1. Cliente envÃ­a: { event: 'end_turn', data: { match_id, action_id } }
 * 2. Validar que usuario estÃ¡ en match (Coordinador)
 * 3. Ejecutar con idempotencia + transacciÃ³n (TurnManager)
 * 4. Broadcast nuevo estado (WebSocket)
 */
export async function handleEndTurnRefactored(
  ws: AuthenticatedWebSocket,
  data: {
    match_id: string;
    action_id?: string;  // UUID para idempotencia
  }
) {
  try {
    console.log(`â­ï¸ ${ws.username} termina turno (REFACTORED)`);

    const { match_id, action_id = uuidv4() } = data;
    const userId = ws.userId!;

    // ========================================================================
    // FASE 2: VALIDACIÃ“N DE CONTEXTO (CPSD)
    // ========================================================================
    const match = await Match.findByPk(match_id);
    if (!match) {
      sendEvent(ws, 'error', { message: 'Partida no encontrada', code: 'MATCH_NOT_FOUND' });
      return;
    }

    // Validar que usuario pertenece al match
    const playerNumber =
      match.player1_id === userId ? 1 : match.player2_id === userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', { message: 'No perteneces a este match', code: 'NOT_IN_MATCH' });
      return;
    }

    // ========================================================================
    // FASE 3: EJECUCIÃ“N CON IDEMPOTENCIA + TRANSACCIÃ“N
    // ========================================================================
    const result = await TurnManager.endTurn(match, playerNumber as 1 | 2, action_id);

    if (!result.success) {
      sendEvent(ws, 'error', { message: result.error || 'Error al terminar turno', code: 'END_TURN_FAILED' });
      return;
    }

    console.log(`âœ… Turno terminado exitosamente`);

    // ========================================================================
    // FASE 4: NOTIFICACIÃ“N A CLIENTES
    // ========================================================================
    // TODO: Enviar nuevo estado a ambos jugadores vÃ­a WebSocketManager
    // const broadcastData = {
    //   match_id,
    //   new_state: result.newState,
    //   is_retry: result.isRetry
    // };
    // await WebSocketManager.broadcast(match_id, 'turn_ended', broadcastData);

    sendEvent(ws, 'turn_ended', {
      success: true,
      action_id,
      is_retry: result.isRetry,
      message: result.isRetry ? 'Reintento exitoso' : 'Turno terminado',
    });
  } catch (error) {
    console.error('âŒ Error en handleEndTurnRefactored:', error);
    sendEvent(ws, 'error', {
      message: 'Error interno del servidor',
      code: 'INTERNAL_ERROR',
    });
  }
}

/**
 * REFACTORIZADO: playCard handler delegando a arquitectura nueva
 */
export async function handlePlayCardRefactored(
  ws: AuthenticatedWebSocket,
  data: {
    match_id: string;
    card_id: string;
    zone: string;        // 'field_knight', 'field_technique', 'helper'
    position: number;
    action_id?: string;   // UUID para idempotencia
  }
) {
  try {
    console.log(`ðŸƒ ${ws.username} juega carta (REFACTORED)`);

    const { match_id, card_id, zone, position, action_id = uuidv4() } = data;
    const userId = ws.userId!;

    // ValidaciÃ³n de contexto
    const match = await Match.findByPk(match_id);
    if (!match) {
      sendEvent(ws, 'error', { message: 'Partida no encontrada' });
      return;
    }

    const playerNumber =
      match.player1_id === userId ? 1 : match.player2_id === userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', { message: 'No perteneces a este match' });
      return;
    }

    // EjecuciÃ³n con transacciÃ³n
    const result = await CardManager.playCard(
      match,
      playerNumber as 1 | 2,
      card_id,
      zone,
      position,
      action_id
    );

    if (!result.success) {
      sendEvent(ws, 'error', { message: result.error || 'No se pudo jugar la carta' });
      return;
    }

    console.log(`âœ… Carta jugada exitosamente`);

    sendEvent(ws, 'card_played', {
      success: true,
      action_id,
      is_retry: result.isRetry,
    });
  } catch (error) {
    console.error('âŒ Error en handlePlayCardRefactored:', error);
    sendEvent(ws, 'error', { message: 'Error interno del servidor' });
  }
}

/**
 * REFACTORIZADO: attack handler delegando a arquitectura nueva
 */
export async function handleAttackRefactored(
  ws: AuthenticatedWebSocket,
  data: {
    match_id: string;
    attacker_card_id: string;
    defender_card_id: string;
    action_id?: string;   // UUID para idempotencia
  }
) {
  try {
    console.log(`âš”ï¸ ${ws.username} ataca (REFACTORED)`);

    const { match_id, attacker_card_id, defender_card_id, action_id = uuidv4() } = data;
    const userId = ws.userId!;

    // ValidaciÃ³n de contexto
    const match = await Match.findByPk(match_id);
    if (!match) {
      sendEvent(ws, 'error', { message: 'Partida no encontrada' });
      return;
    }

    const playerNumber =
      match.player1_id === userId ? 1 : match.player2_id === userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', { message: 'No perteneces a este match' });
      return;
    }

    // EjecuciÃ³n con transacciÃ³n
    const result = await AttackManager.attack(
      match,
      playerNumber as 1 | 2,
      attacker_card_id,
      defender_card_id,
      action_id
    );

    if (!result.success) {
      sendEvent(ws, 'error', { message: result.error || 'No se pudo ejecutar ataque' });
      return;
    }

    console.log(`âœ… Ataque exitoso, daÃ±o: ${result.damage}`);

    sendEvent(ws, 'attack_executed', {
      success: true,
      action_id,
      damage: result.damage,
      is_retry: result.isRetry,
    });
  } catch (error) {
    console.error('âŒ Error en handleAttackRefactored:', error);
    sendEvent(ws, 'error', { message: 'Error interno del servidor' });
  }
}

/**
 * REFACTORIZADO: changeDefensiveMode handler
 */
export async function handleChangeDefensiveModeRefactored(
  ws: AuthenticatedWebSocket,
  data: {
    match_id: string;
    card_id: string;
    mode: 'normal' | 'defense' | 'evasion';
    action_id?: string;   // UUID para idempotencia
  }
) {
  try {
    console.log(`ðŸ›¡ï¸ ${ws.username} cambia modo defensivo (REFACTORED)`);

    const { match_id, card_id, mode, action_id = uuidv4() } = data;
    const userId = ws.userId!;

    // ValidaciÃ³n de contexto
    const match = await Match.findByPk(match_id);
    if (!match) {
      sendEvent(ws, 'error', { message: 'Partida no encontrada' });
      return;
    }

    const playerNumber =
      match.player1_id === userId ? 1 : match.player2_id === userId ? 2 : null;

    if (!playerNumber) {
      sendEvent(ws, 'error', { message: 'No perteneces a este match' });
      return;
    }

    // EjecuciÃ³n con transacciÃ³n
    const result = await AttackManager.changeDefensiveMode(
      match,
      playerNumber as 1 | 2,
      card_id,
      mode,
      action_id
    );

    if (!result.success) {
      sendEvent(ws, 'error', { message: result.error || 'No se pudo cambiar modo' });
      return;
    }

    console.log(`âœ… Modo defensivo cambiado a ${mode}`);

    sendEvent(ws, 'defensive_mode_changed', {
      success: true,
      action_id,
      mode,
      is_retry: result.isRetry,
    });
  } catch (error) {
    console.error('âŒ Error en handleChangeDefensiveModeRefactored:', error);
    sendEvent(ws, 'error', { message: 'Error interno del servidor' });
  }
}

/**
 * CÃ“MO INTEGRAR EN websocket.service.ts:
 * 
 * 1. Importar en websocket.service.ts:
 *    import { handleEndTurnRefactored, handlePlayCardRefactored, ... } from './websocket-integrations';
 * 
 * 2. En messageHandler, reemplazar handlers viejos:
 *    
 *    case 'end_turn':
 *      await handleEndTurnRefactored(ws, eventData);  // â† NEW
 *      break;
 * 
 *    case 'play_card':
 *      await handlePlayCardRefactored(ws, eventData);  // â† NEW
 *      break;
 * etc.
 * 
 * 3. Mantener handlers viejos temporalmente como fallback (deprecation period)
 * 
 * 4. Una vez validado, borrar handlers viejos
 */