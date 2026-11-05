/**
 * replay.service.ts
 *
 * Repeticiones de partidas: grabación, cierre y consulta.
 *
 *  - recordFrame: lo llama MatchesCoordinator cada vez que difunde un match_update.
 *    Nunca lanza: un fallo al grabar no debe romper la partida.
 *  - finish: al terminar la partida (victoria o abandono) cierra la repetición y borra las que
 *    ya no están entre las últimas REPLAYS_PER_PLAYER de alguno de sus jugadores.
 *  - getForUser: la repetición completa, vista desde el lado del jugador que la pide.
 */
import { MatchReplayRepository, MIN_REPLAY_FRAMES } from '../../infrastructure/database/repositories/MatchReplayRepository';
import { buildStoredFrame, frameForViewer } from './replayFrames';

export const REPLAYS_PER_PLAYER = 5;

export type ReplayResult =
  | { success: true; data: { match: Record<string, any>; frames: Record<string, any>[] } }
  | { success: false; statusCode: number; code: string; error: string };

export class ReplayService {
  static async recordFrame(
    matchId: string,
    matchData: Record<string, any>,
    lastAction: Record<string, any> | null,
    engineEvents: any[],
  ): Promise<void> {
    try {
      await MatchReplayRepository.appendFrame(matchId, buildStoredFrame(matchData, lastAction, engineEvents));
      if (matchData?.phase === 'finished' || matchData?.current_phase === 'finished') {
        await this.finish(matchId);
      }
    } catch (error: any) {
      console.error(`[ReplayService] No se pudo grabar el fotograma de ${matchId}:`, error?.message ?? error);
    }
  }

  static async finish(matchId: string): Promise<void> {
    try {
      const players = await MatchReplayRepository.markFinished(matchId);
      if (!players) return;
      const removed = await MatchReplayRepository.pruneForUsers(
        [players.player1_id, players.player2_id ?? ''],
        REPLAYS_PER_PLAYER,
      );
      if (removed > 0) console.log(`🎞️  [ReplayService] ${removed} repetición(es) antigua(s) borrada(s)`);
    } catch (error: any) {
      console.error(`[ReplayService] No se pudo cerrar la repetición de ${matchId}:`, error?.message ?? error);
    }
  }

  /** De estas partidas, cuáles tienen repetición disponible. */
  static async availableFor(matchIds: string[]): Promise<Set<string>> {
    try {
      return await MatchReplayRepository.findAvailable(matchIds);
    } catch (error: any) {
      console.error('[ReplayService] No se pudieron consultar las repeticiones:', error?.message ?? error);
      return new Set();
    }
  }

  static async getForUser(matchId: string, userId: string): Promise<ReplayResult> {
    const header = await MatchReplayRepository.getHeader(matchId);
    if (!header || !header.finished_at || header.frame_count < MIN_REPLAY_FRAMES) {
      return { success: false, statusCode: 404, code: 'REPLAY_NOT_FOUND', error: 'Repetición no disponible' };
    }

    const viewer: 1 | 2 | null = header.player1_id === userId ? 1 : header.player2_id === userId ? 2 : null;
    if (!viewer) {
      return { success: false, statusCode: 403, code: 'NOT_IN_MATCH', error: 'No participaste en esta partida' };
    }

    const frames = await MatchReplayRepository.getFrames(matchId);
    return {
      success: true,
      data: {
        match: {
          match_id: header.match_id,
          is_test: header.is_test,
          winner_id: header.winner_id,
          finished_at: header.finished_at,
          frame_count: frames.length,
          viewer_player: viewer,
          player1: { id: header.player1_id, username: header.player1_name },
          player2: { id: header.player2_id, username: header.player2_name },
        },
        frames: frames.map(frame => frameForViewer(frame, viewer, header.is_test)),
      },
    };
  }
}
