import User from '../../infrastructure/database/models/User';

export class GetCurrentUserUseCase {
  async execute(userId: string): Promise<User | null> {
    return User.findByPk(userId, {
      attributes: {
        exclude: ['password_hash', 'email_verification_token', 'email_verification_expires'],
      },
    });
  }
}
