import { Op } from 'sequelize';
import User from '../../infrastructure/database/models/User';
import emailService from '../../infrastructure/mail/emailService';
import { AuthUseCaseError } from './auth-use-case.error';

export class EmailVerificationUseCase {
  async verify(token: unknown): Promise<void> {
    if (typeof token !== 'string' || !token) {
      throw new AuthUseCaseError('Token de verificación requerido', 400);
    }

    const user = await User.findOne({
      where: {
        email_verification_token: token,
        email_verification_expires: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      throw new AuthUseCaseError('Token de verificación inválido o expirado', 400);
    }

    user.is_email_verified = true;
    user.email_verification_token = null;
    user.email_verification_expires = null;
    await user.save();
  }

  async resend(email: unknown): Promise<void> {
    if (typeof email !== 'string' || !email) {
      throw new AuthUseCaseError('Email es requerido', 400);
    }

    const user = await User.findOne({ where: { email } });
    if (!user || user.is_email_verified) {
      return;
    }

    const verificationToken = emailService.generateVerificationToken();
    const verificationExpires = emailService.generateExpirationDate();
    user.email_verification_token = verificationToken;
    user.email_verification_expires = verificationExpires;
    await user.save();

    // Un fallo de envío no debe distinguirse de "cuenta inexistente" (F10)
    try {
      await emailService.sendVerificationEmail(email, user.username, verificationToken);
    } catch (error) {
      console.error('Error reenviando email de verificación:', error);
    }
  }
}
