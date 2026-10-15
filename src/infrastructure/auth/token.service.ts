import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface UserAccessTokenPayload extends JwtPayload {
  userId: string;
  username: string;
  sessionId: string;
}

export interface AdminAccessTokenPayload extends JwtPayload {
  role: 'admin';
}

const getRequiredEnvironmentValue = (name: 'JWT_SECRET' | 'ADMIN_PASSWORD'): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`La variable de entorno ${name} es obligatoria`);
  }

  return value;
};

const getJwtExpiresIn = (): SignOptions['expiresIn'] =>
  (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

export const validateSecurityConfiguration = (): void => {
  getRequiredEnvironmentValue('JWT_SECRET');
  getRequiredEnvironmentValue('ADMIN_PASSWORD');

  if (!process.env.CORS_ORIGIN) {
    throw new Error('La variable de entorno CORS_ORIGIN es obligatoria');
  }
};

export const getAdminPassword = (): string => getRequiredEnvironmentValue('ADMIN_PASSWORD');

export const createUserAccessToken = (payload: UserAccessTokenPayload): string =>
  jwt.sign(payload, getRequiredEnvironmentValue('JWT_SECRET'), {
    expiresIn: getJwtExpiresIn(),
  });

export const verifyUserAccessToken = (token: string): UserAccessTokenPayload => {
  const payload = jwt.verify(token, getRequiredEnvironmentValue('JWT_SECRET'));

  if (
    typeof payload === 'string'
    || !payload.userId
    || !payload.username
    || !payload.sessionId
  ) {
    throw new jwt.JsonWebTokenError('Token inválido');
  }

  return payload as UserAccessTokenPayload;
};

export const createAdminAccessToken = (): string =>
  jwt.sign({ role: 'admin' }, getRequiredEnvironmentValue('JWT_SECRET'), {
    expiresIn: '24h',
  });

export const verifyAdminAccessToken = (token: string): AdminAccessTokenPayload => {
  const payload = jwt.verify(token, getRequiredEnvironmentValue('JWT_SECRET'));

  if (typeof payload === 'string' || payload.role !== 'admin') {
    throw new jwt.JsonWebTokenError('Token inválido');
  }

  return payload as AdminAccessTokenPayload;
};
