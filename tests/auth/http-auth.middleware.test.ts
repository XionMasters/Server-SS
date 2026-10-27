jest.mock('../../src/infrastructure/database/models/User', () => ({
  __esModule: true,
  default: { findByPk: jest.fn() },
}));

jest.mock('../../src/infrastructure/auth/session.service', () => ({
  getActiveUserSession: jest.fn(),
}));

jest.mock('../../src/infrastructure/auth/token.service', () => ({
  verifyUserAccessToken: jest.fn(),
}));

import User from '../../src/infrastructure/database/models/User';
import { getActiveUserSession } from '../../src/infrastructure/auth/session.service';
import { verifyUserAccessToken } from '../../src/infrastructure/auth/token.service';
import { authenticateToken } from '../../src/interfaces/http/middleware/auth.middleware';

describe('authenticateToken', () => {
  it('rejects an otherwise valid token when its session was revoked', async () => {
    (verifyUserAccessToken as jest.Mock).mockReturnValue({
      userId: 'user-id',
      username: 'pegaso',
      sessionId: 'session-id',
    });
    (getActiveUserSession as jest.Mock).mockResolvedValue(null);

    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      json,
    };
    const next = jest.fn();
    const request = {
      headers: { authorization: 'Bearer revoked-token' },
    };

    await authenticateToken(request as any, response as any, next);

    expect(User.findByPk).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'SESSION_INVALIDATED',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a blocked user even with a valid session', async () => {
    (verifyUserAccessToken as jest.Mock).mockReturnValue({
      userId: 'user-id',
      username: 'pegaso',
      sessionId: 'session-id',
    });
    (getActiveUserSession as jest.Mock).mockResolvedValue({ id: 'session-id' });
    (User.findByPk as jest.Mock).mockResolvedValue({ id: 'user-id', blocked_at: new Date() });

    const json = jest.fn();
    const response = { status: jest.fn().mockReturnThis(), json };
    const next = jest.fn();

    await authenticateToken({ headers: { authorization: 'Bearer token' } } as any, response as any, next);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_BLOCKED' }));
    expect(next).not.toHaveBeenCalled();
  });
});
