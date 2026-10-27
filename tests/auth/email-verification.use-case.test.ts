import { EmailVerificationUseCase } from '../../src/app/auth/email-verification.use-case';
import User from '../../src/infrastructure/database/models/User';
import emailService from '../../src/infrastructure/mail/emailService';

describe('EmailVerificationUseCase.resend (F10)', () => {
  beforeEach(() => jest.restoreAllMocks());

  test('does not reveal that the account exists when sending fails', async () => {
    const user: any = { username: 'Shiryu', is_email_verified: false, save: jest.fn() };
    jest.spyOn(User, 'findOne').mockResolvedValue(user);
    jest.spyOn(emailService, 'sendVerificationEmail').mockRejectedValue(new Error('SMTP caído'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(new EmailVerificationUseCase().resend('shiryu@example.com')).resolves.toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });

  test('returns silently for unknown accounts', async () => {
    jest.spyOn(User, 'findOne').mockResolvedValue(null);
    const send = jest.spyOn(emailService, 'sendVerificationEmail');

    await expect(new EmailVerificationUseCase().resend('nadie@example.com')).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
