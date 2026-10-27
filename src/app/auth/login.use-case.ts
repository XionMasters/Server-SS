import bcrypt from 'bcryptjs';
import { col, fn, where as sequelizeWhere } from 'sequelize';
import User from '../../infrastructure/database/models/User';
import { deactivateAllUserSessions } from '../../infrastructure/auth/session.service';
import { AuthUseCaseError } from './auth-use-case.error';
import { IssueSessionUseCase, SessionClientMetadata } from './issue-session.use-case';

export class LoginUseCase {
  constructor(private readonly issueSessionUseCase = new IssueSessionUseCase()) {}

  async execute(
    email: unknown,
    password: unknown,
    metadata: SessionClientMetadata
  ): Promise<{ user: User; token: string }> {
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      throw new AuthUseCaseError('Email y contraseña son requeridos', 400);
    }

    // Igualdad sin distinguir mayúsculas; iLike trataría '%' y '_' como comodines
    const user = await User.findOne({
      where: sequelizeWhere(fn('lower', col('email')), email.toLowerCase()),
    });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AuthUseCaseError('Credenciales inválidas', 401);
    }

    if (user.blocked_at) {
      throw new AuthUseCaseError('Tu cuenta ha sido bloqueada', 403);
    }

    await deactivateAllUserSessions(user.id);
    const token = await this.issueSessionUseCase.execute(user, metadata);

    return { user, token };
  }
}
