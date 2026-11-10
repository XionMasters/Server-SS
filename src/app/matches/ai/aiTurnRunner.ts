// src/app/matches/ai/aiTurnRunner.ts
// Juega los turnos de la IA en las partidas Jugador vs IA.
//
// Se despierta cada vez que cambia el estado de una partida en la que participa la IA
// (MatchesCoordinator.onMatchStateChanged) y, mientras le toque (su turno o una selección
// pendiente suya), pide una jugada a decideAiMove y la ejecuta por la misma puerta que un
// jugador: matchesCoordinator.handleAction / SelectionService. Los match_update resultantes
// se entregan al jugador humano con matchesCoordinator.publishEvents.
//
// Garantías:
//   - Un solo bucle por partida a la vez (si llega otro aviso mientras juega, repasa al acabar).
//   - Una jugada que falla no se repite en ese turno; si nada funciona, termina el turno.
//   - Tope de jugadas por turno para no quedarse nunca en bucle.

import { randomUUID } from 'crypto';
import { MatchStateService } from '../lifecycle/matchState.service';
import { ActionResolver } from '../actions/ActionResolver';
import { SelectionService } from '../actions/SelectionService';
import { matchesCoordinator, MatchesCoordinator } from '../coordinators/matchesCoordinator';
import { AI_BOT_USER_ID, isAiBot } from './aiBot';
import { decideAiMove, END_TURN_KEY, type AiMove } from './aiDecision';

const MAX_MOVES_PER_TURN = 40;

export interface AiTurnRunnerOptions {
  /** Pausa antes de cada jugada, para que el jugador vea las animaciones (ms). */
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  coordinator?: MatchesCoordinator;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export class AiTurnRunner {
  private readonly running = new Set<string>();
  private readonly pending = new Set<string>();
  private readonly delayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly coordinator: MatchesCoordinator;

  constructor(options: AiTurnRunnerOptions = {}) {
    const fromEnv = Number(process.env.AI_MOVE_DELAY_MS);
    this.delayMs = options.delayMs ?? (Number.isFinite(fromEnv) && fromEnv >= 0 ? fromEnv : 1100);
    this.sleep = options.sleep ?? defaultSleep;
    this.coordinator = options.coordinator ?? matchesCoordinator;
  }

  /** Engancha el ejecutor a los cambios de estado de las partidas. */
  attach(): void {
    this.coordinator.onMatchStateChanged((matchId, state) => {
      if (state.phase === 'finished') return;
      if (isAiBot(state.player1Id) || isAiBot(state.player2Id)) this.schedule(matchId);
    });
  }

  /** Pide a la IA que mire la partida (no hace nada si no le toca). */
  schedule(matchId: string): void {
    if (this.running.has(matchId)) {
      this.pending.add(matchId);
      return;
    }
    void this.run(matchId);
  }

  /** Promesa que se resuelve cuando la IA deja de jugar en esa partida (para tests y scripts). */
  async run(matchId: string): Promise<void> {
    if (this.running.has(matchId)) {
      this.pending.add(matchId);
      return;
    }
    this.running.add(matchId);
    try {
      do {
        this.pending.delete(matchId);
        await this.playWhileItsAiTurn(matchId);
      } while (this.pending.has(matchId));
    } catch (error: any) {
      console.error(`[IA] Error jugando la partida ${matchId}:`, error?.message ?? error);
    } finally {
      this.running.delete(matchId);
      this.pending.delete(matchId);
    }
  }

  isRunning(matchId: string): boolean {
    return this.running.has(matchId);
  }

  private async playWhileItsAiTurn(matchId: string): Promise<void> {
    const failed = new Set<string>();
    let turnKey = '';
    let movesThisTurn = 0;

    for (;;) {
      const state = await loadAiState(matchId);
      if (!state) return;

      const botPlayer: 1 | 2 | null = isAiBot(state.player1_id) ? 1 : isAiBot(state.player2_id) ? 2 : null;
      if (!botPlayer) return;

      const currentTurnKey = `${state.current_turn}:${state.current_player}`;
      if (currentTurnKey !== turnKey) {
        turnKey = currentTurnKey;
        failed.clear();
        movesThisTurn = 0;
      }

      let move: AiMove = decideAiMove(state, botPlayer, failed);
      if (move.kind === 'wait') return;

      if (movesThisTurn >= MAX_MOVES_PER_TURN && move.kind === 'action' && move.key !== END_TURN_KEY) {
        console.warn(`[IA] Tope de ${MAX_MOVES_PER_TURN} jugadas en la partida ${matchId}: termina el turno`);
        move = { kind: 'action', key: END_TURN_KEY, action: { type: 'END_TURN' } };
      }

      if (this.delayMs > 0) await this.sleep(this.delayMs);

      const outcome = await executeAiMove(this.coordinator, matchId, AI_BOT_USER_ID, move);
      movesThisTurn++;
      if (!outcome.ok) {
        console.warn(`[IA] Jugada rechazada (${move.key}): ${outcome.error ?? 'sin detalle'}`);
        failed.add(move.key);
        // Si ni siquiera puede terminar el turno, no insistir (el próximo aviso lo reintentará)
        if (move.key === END_TURN_KEY) return;
      }
    }
  }
}

/** Estado completo de la partida con las valid_actions del jugador activo (lo que decide la IA). */
export async function loadAiState(matchId: string): Promise<any | null> {
  const result = await MatchStateService.buildBroadcastMatchState(matchId);
  if (!result.success || !result.data) return null;
  const state = result.data;
  state.cards_in_play = ActionResolver.resolve(state.cards_in_play || [], state);
  return state;
}

/**
 * Ejecuta una jugada como el usuario `userId`, por la misma puerta que un jugador,
 * y entrega los match_update resultantes. No lanza: devuelve el error del servidor.
 */
export async function executeAiMove(
  coordinator: MatchesCoordinator,
  matchId: string,
  userId: string,
  move: AiMove,
): Promise<{ ok: boolean; error?: string }> {
  if (move.kind === 'wait') return { ok: false, error: 'nada que hacer' };

  if (move.kind === 'selection') {
    const result = await SelectionService.resolveSelection({
      match_id: matchId,
      user_id: userId,
      selection_id: move.selectionId,
      chosen_card_id: move.chosenCardId,
      ...(typeof move.chosenSlot === 'number' ? { chosen_slot: move.chosenSlot } : {}),
      action_id: randomUUID(),
    });
    if (!result.success) return { ok: false, error: result.error };
    const events = await coordinator.buildMatchUpdateEvents(
      matchId,
      {
        type: 'resolve_selection',
        selection_id: move.selectionId,
        chosen_card_id: move.chosenCardId,
        ...(typeof move.chosenSlot === 'number' ? { chosen_slot: move.chosenSlot } : {}),
      },
      result.events ?? [],
    );
    coordinator.publishEvents(events);
    return { ok: true };
  }

  const result = await coordinator.handleAction({
    userId,
    action: { ...move.action, match_id: matchId, action_id: randomUUID() },
  });
  if (!result?.success) return { ok: false, error: result?.error ?? 'sin detalle' };
  coordinator.publishEvents(result.events ?? []);
  return { ok: true };
}

export const aiTurnRunner = new AiTurnRunner();
