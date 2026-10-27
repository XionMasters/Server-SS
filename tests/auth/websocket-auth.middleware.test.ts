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

jest.mock('../../src/interfaces/websocket/handlers/admin.handler', () => ({
  handleAdminAuthentication: jest.fn().mockResolvedValue(false),
}));

import { handleAdminAuthentication } from '../../src/interfaces/websocket/handlers/admin.handler';
import { getActiveUserSession } from '../../src/infrastructure/auth/session.service';
import { verifyUserAccessToken } from '../../src/infrastructure/auth/token.service';
import { authenticateSocket } from '../../src/infrastructure/websocket/middleware/auth.middleware';

describe('authenticateSocket', () => {
  it('rejects a WebSocket token when its session was revoked', async () => {
    (verifyUserAccessToken as jest.Mock).mockReturnValue({
      userId: 'user-id',
      username: 'pegaso',
      sessionId: 'session-id',
    });
    (getActiveUserSession as jest.Mock).mockResolvedValue(null);

    const socket = {};
    const request = {
      headers: { authorization: 'Bearer revoked-token' },
    };

    await expect(authenticateSocket(socket as any, request as any)).rejects.toMatchObject({
      code: 'SESSION_INVALIDATED',
    });
  });

  it('reads the admin token from the WebSocket subprotocol', async () => {
    (handleAdminAuthentication as jest.Mock).mockResolvedValueOnce(true);

    const result = await authenticateSocket({} as any, {
      headers: { 'sec-websocket-protocol': 'admin, admin.jwt.token' },
    } as any);

    expect(handleAdminAuthentication).toHaveBeenCalledWith(expect.anything(), 'admin.jwt.token');
    expect(result.isAdmin).toBe(true);
  });

  it('rejects an invalid admin token instead of falling back to user auth', async () => {
    (handleAdminAuthentication as jest.Mock).mockResolvedValueOnce(false);

    await expect(authenticateSocket({} as any, {
      headers: { 'sec-websocket-protocol': 'admin, bad-token' },
    } as any)).rejects.toMatchObject({ code: 'INVALID_ADMIN_TOKEN' });
  });

  it('ignores subprotocols that are not the admin one', async () => {
    await expect(authenticateSocket({} as any, {
      headers: { 'sec-websocket-protocol': 'chat, something' },
    } as any)).rejects.toMatchObject({ code: 'NO_TOKEN' });
  });
});
