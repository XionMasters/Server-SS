import bcrypt from 'bcryptjs';
import { Op, col, fn, where as sequelizeWhere } from 'sequelize';
import { sequelize } from '../../config/database';
import User from '../../infrastructure/database/models/User';
import ProfileAvatar from '../../infrastructure/database/models/ProfileAvatar';
import UserProfile from '../../infrastructure/database/models/UserProfile';
import UserAvatarUnlock from '../../infrastructure/database/models/UserAvatarUnlock';
import DeckBack from '../../infrastructure/database/models/DeckBack';
import UserDeckBackUnlock from '../../infrastructure/database/models/UserDeckBackUnlock';
import emailService from '../../infrastructure/mail/emailService';
import transactionService from '../../infrastructure/database/services/transaction.service';
import { assignStarterCards } from '../../scripts/assignStarterCards';
import { AuthUseCaseError } from './auth-use-case.error';
import { IssueSessionUseCase, SessionClientMetadata } from './issue-session.use-case';

const REGISTRATION_BONUS = 400;

export interface RegisterInput {
  username: unknown;
  email: unknown;
  password: unknown;
}

export class RegisterUseCase {
  constructor(private readonly issueSessionUseCase = new IssueSessionUseCase()) {}

  async execute(
    input: RegisterInput,
    metadata: SessionClientMetadata
  ): Promise<{ user: User; token: string }> {
    const { username, email, password } = input;

    if (
      typeof username !== 'string'
      || typeof email !== 'string'
      || typeof password !== 'string'
      || !username
      || !email
      || !password
    ) {
      throw new AuthUseCaseError('Todos los campos son requeridos', 400);
    }

    if (password.length < 6) {
      throw new AuthUseCaseError('La contraseña debe tener al menos 6 caracteres', 400);
    }

    // Igualdad sin distinguir mayúsculas; iLike trataría '%' y '_' como comodines
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [
          sequelizeWhere(fn('lower', col('email')), email.toLowerCase()),
          sequelizeWhere(fn('lower', col('username')), username.toLowerCase()),
        ],
      },
    });

    if (existingUser) {
      if (existingUser.email.toLowerCase() === email.toLowerCase()) {
        throw new AuthUseCaseError('El email ya está registrado', 400);
      }

      if (existingUser.username.toLowerCase() === username.toLowerCase()) {
        throw new AuthUseCaseError('El nombre de usuario ya existe', 400);
      }

      throw new AuthUseCaseError('El usuario o email ya existe', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = emailService.generateExpirationDate();
    // Usuario, mazo inicial y monedas de bienvenida se crean de forma atómica
    const user = await sequelize.transaction(async (transaction) => {
      const created = await User.create({
        username,
        email,
        password_hash: passwordHash,
        currency: REGISTRATION_BONUS,
        is_email_verified: false,
        email_verification_token: verificationToken,
        email_verification_expires: verificationExpires,
      }, { transaction });

      await assignStarterCards(created.id, transaction);

      await transactionService.logCurrencyTransaction(
        created.id,
        REGISTRATION_BONUS,
        'EARN',
        'REGISTRATION_BONUS',
        'Monedas de bienvenida por registro',
        'user',
        created.id,
        { starter_deck: 40 },
        transaction,
        { before: 0, after: REGISTRATION_BONUS }
      );

      return created;
    });

    try {
      await emailService.sendVerificationEmail(email, username, verificationToken);
    } catch (error) {
      console.error('Error enviando email de verificación:', error);
    }

    try {
      const defaultAvatars = await ProfileAvatar.findAll({
        where: { unlock_type: 'default', is_active: true },
      });

      if (defaultAvatars.length > 0) {
        await UserProfile.create({
          user_id: user.id,
          avatar_image_id: defaultAvatars[0].id,
        });

        for (const avatar of defaultAvatars) {
          await UserAvatarUnlock.create({
            user_id: user.id,
            avatar_id: avatar.id,
            unlock_source: 'registration_default',
          });
        }
      }
    } catch (error) {
      console.error('Error asignando avatares por defecto:', error);
    }

    try {
      const defaultDeckBacks = await DeckBack.findAll({
        where: { unlock_type: 'default', is_active: true },
      });

      for (const deckBack of defaultDeckBacks) {
        await UserDeckBackUnlock.findOrCreate({
          where: { user_id: user.id, deck_back_id: deckBack.id },
          defaults: {
            user_id: user.id,
            deck_back_id: deckBack.id,
            unlock_source: 'initial_setup',
          },
        });
      }
    } catch (error) {
      console.error('Error asignando dorsos por defecto:', error);
    }

    const token = await this.issueSessionUseCase.execute(user, metadata);
    return { user, token };
  }
}
