import { randomUUID } from 'crypto';
import { decode } from 'jsonwebtoken';
import User from '../../infrastructure/database/models/User';
import {
  createUserAccessToken,
  UserAccessTokenPayload,
} from '../../infrastructure/auth/token.service';
import { createUserSession } from '../../infrastructure/auth/session.service';

export interface SessionClientMetadata {
  ipAddress: string;
  userAgent: string;
}

export class IssueSessionUseCase {
  async execute(user: User, metadata: SessionClientMetadata): Promise<string> {
    const sessionId = randomUUID();
    const token = createUserAccessToken({
      userId: user.id,
      username: user.username,
      sessionId,
    } satisfies UserAccessTokenPayload);
    const tokenPayload = decode(token);

    if (!tokenPayload || typeof tokenPayload === 'string' || !tokenPayload.exp) {
      throw new Error('No se pudo obtener la expiración del token');
    }

    await createUserSession({
      id: sessionId,
      userId: user.id,
      token,
      expiresAt: new Date(tokenPayload.exp * 1000),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
    });

    return token;
  }
}
