import { deactivateUserSession } from '../../infrastructure/auth/session.service';

export class LogoutUseCase {
  execute(userId: string, sessionId: string): Promise<void> {
    return deactivateUserSession(userId, sessionId);
  }
}
