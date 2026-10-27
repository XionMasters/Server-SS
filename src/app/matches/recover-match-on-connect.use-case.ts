export interface MatchParticipant {
  id: string;
  username?: string;
}

export interface RecoverableMatch {
  id: string;
  phase: string;
  player1_id: string;
  player2_id: string | null;
  player1_life: number;
  player2_life: number;
  player1_cosmos: number;
  player2_cosmos: number;
  current_turn: number;
  current_player: number;
  player1: MatchParticipant | null;
  player2: MatchParticipant | null;
}

export interface MatchRecoveryRepository {
  clearWaitingMatches(userId: string): Promise<number>;
  findActiveMatch(userId: string): Promise<RecoverableMatch | null>;
  deleteMatch(matchId: string): Promise<void>;
}

export interface MatchRecoveryResult {
  cleanedWaitingCount: number;
  matchResumed?: {
    match_id: string;
    phase: string;
    player1: MatchParticipant;
    player2: MatchParticipant;
    player1_life: number;
    player2_life: number;
    player1_cosmos: number;
    player2_cosmos: number;
    current_turn: number;
    current_player: number;
  };
}

export class RecoverMatchOnConnectUseCase {
  constructor(private readonly repository: MatchRecoveryRepository) {}

  async execute(
    userId: string,
    isUserOnline: (userId: string) => boolean,
  ): Promise<MatchRecoveryResult> {
    const cleanedWaitingCount = await this.repository.clearWaitingMatches(userId);
    const activeMatch = await this.repository.findActiveMatch(userId);

    if (!activeMatch) {
      return { cleanedWaitingCount };
    }

    if (!activeMatch.player1 || !activeMatch.player2) {
      await this.repository.deleteMatch(activeMatch.id);
      return { cleanedWaitingCount };
    }

    const isTestMode = activeMatch.player1_id === activeMatch.player2_id;

    if (!isTestMode) {
      const otherPlayerId = activeMatch.player1_id === userId
        ? activeMatch.player2_id
        : activeMatch.player1_id;

      if (!otherPlayerId || !isUserOnline(otherPlayerId)) {
        await this.repository.deleteMatch(activeMatch.id);
        return { cleanedWaitingCount };
      }
    }

    return {
      cleanedWaitingCount,
      matchResumed: {
        match_id: activeMatch.id,
        phase: activeMatch.phase,
        player1: activeMatch.player1,
        player2: activeMatch.player2,
        player1_life: activeMatch.player1_life,
        player2_life: activeMatch.player2_life,
        player1_cosmos: activeMatch.player1_cosmos,
        player2_cosmos: activeMatch.player2_cosmos,
        current_turn: activeMatch.current_turn,
        current_player: activeMatch.current_player,
      },
    };
  }
}
