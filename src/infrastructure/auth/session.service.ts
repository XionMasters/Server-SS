import UserSession from '../database/models/UserSession';

export interface CreateUserSessionInput {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

export const createUserSession = (input: CreateUserSessionInput): Promise<UserSession> =>
  UserSession.create({
    id: input.id,
    user_id: input.userId,
    token: input.token,
    is_active: true,
    created_at: new Date(),
    expires_at: input.expiresAt,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
  });

export const getActiveUserSession = async (
  userId: string,
  sessionId: string,
  token: string
): Promise<UserSession | null> => {
  const session = await UserSession.findOne({
    where: {
      id: sessionId,
      user_id: userId,
      token,
      is_active: true,
    },
  });

  if (!session) {
    return null;
  }

  if (session.expires_at && new Date() > session.expires_at) {
    await session.update({ is_active: false });
    return null;
  }

  return session;
};

export const deactivateUserSession = async (
  userId: string,
  sessionId: string
): Promise<void> => {
  await UserSession.update(
    { is_active: false },
    { where: { id: sessionId, user_id: userId, is_active: true } }
  );
};

export const deactivateAllUserSessions = async (userId: string): Promise<void> => {
  await UserSession.update(
    { is_active: false },
    { where: { user_id: userId, is_active: true } }
  );
};
