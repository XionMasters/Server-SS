jest.mock('../../src/infrastructure/database/models/User', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(), findOne: jest.fn() },
}));

jest.mock('../../src/infrastructure/auth/session.service', () => ({
  deactivateAllUserSessions: jest.fn(),
}));

import bcrypt from 'bcryptjs';
import User from '../../src/infrastructure/database/models/User';
import { deactivateAllUserSessions } from '../../src/infrastructure/auth/session.service';
import {
  handleAdminBlockUser,
  handleAdminUnblockUser,
} from '../../src/interfaces/websocket/handlers/admin.handler';
import { LoginUseCase } from '../../src/app/auth/login.use-case';
import { AuthUseCaseError } from '../../src/app/auth/auth-use-case.error';

const fakeSocket = () => ({ readyState: 1, send: jest.fn(), close: jest.fn() }) as any;

describe('Bloqueo persistente de usuarios (F14)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('block persists blocked_at, revokes sessions and closes every socket', async () => {
    const user: any = { id: 'user-1', username: 'Ikki', blocked_at: null, save: jest.fn() };
    (User.findByPk as jest.Mock).mockResolvedValue(user);
    const [ws1, ws2] = [fakeSocket(), fakeSocket()];

    await handleAdminBlockUser(
      { user_id: 'user-1' },
      new Map([['user-1', ws1]]),
      new Map([['user-1', new Set([ws1, ws2])]])
    );

    expect(user.blocked_at).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalled();
    expect(deactivateAllUserSessions).toHaveBeenCalledWith('user-1');
    expect(ws1.close).toHaveBeenCalledWith(1008, 'USER_BLOCKED');
    expect(ws2.close).toHaveBeenCalledWith(1008, 'USER_BLOCKED');
  });

  test('unblock clears blocked_at', async () => {
    const user: any = { id: 'user-1', username: 'Ikki', blocked_at: new Date(), save: jest.fn() };
    (User.findByPk as jest.Mock).mockResolvedValue(user);

    await handleAdminUnblockUser({ user_id: 'user-1' }, new Map());

    expect(user.blocked_at).toBeNull();
    expect(user.save).toHaveBeenCalled();
  });

  test('login rejects a blocked user only after checking the password', async () => {
    const password_hash = await bcrypt.hash('secreto', 4);
    (User.findOne as jest.Mock).mockResolvedValue({ id: 'user-1', password_hash, blocked_at: new Date() });
    const issueSession = { execute: jest.fn() } as any;
    const login = new LoginUseCase(issueSession);

    await expect(login.execute('ikki@example.com', 'mala', {} as any)).rejects.toMatchObject({ statusCode: 401 });
    await expect(login.execute('ikki@example.com', 'secreto', {} as any)).rejects.toMatchObject({ statusCode: 403 });
    expect(issueSession.execute).not.toHaveBeenCalled();
  });

  test('login does not treat % as a wildcard', async () => {
    (User.findOne as jest.Mock).mockResolvedValue(null);
    const login = new LoginUseCase({ execute: jest.fn() } as any);

    await expect(login.execute('%', 'x', {} as any)).rejects.toBeInstanceOf(AuthUseCaseError);
    const where = (User.findOne as jest.Mock).mock.calls[0][0].where;
    expect(JSON.stringify(where)).not.toContain('iLike');
  });
});
