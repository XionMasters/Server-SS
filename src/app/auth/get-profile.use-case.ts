import User from '../../infrastructure/database/models/User';

export class GetProfileUseCase {
  execute(user: User) {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      currency: user.currency,
      is_email_verified: user.is_email_verified,
      created_at: user.created_at,
    };
  }
}
