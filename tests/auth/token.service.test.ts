import {
  createUserAccessToken,
  verifyUserAccessToken,
} from '../../src/infrastructure/auth/token.service';

describe('token.service', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  it('includes sessionId in user access tokens', () => {
    const token = createUserAccessToken({
      userId: 'user-id',
      username: 'pegaso',
      sessionId: 'session-id',
    });

    expect(verifyUserAccessToken(token)).toMatchObject({
      userId: 'user-id',
      username: 'pegaso',
      sessionId: 'session-id',
    });
  });

  it('rejects legacy tokens without a sessionId', () => {
    const legacyToken = require('jsonwebtoken').sign(
      { userId: 'user-id', username: 'pegaso' },
      process.env.JWT_SECRET
    );

    expect(() => verifyUserAccessToken(legacyToken)).toThrow('Token inválido');
  });
});
