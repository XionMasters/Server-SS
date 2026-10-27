import { Request, Response } from 'express';
import { AuthUseCaseError } from '../../../app/auth/auth-use-case.error';
import { EmailVerificationUseCase } from '../../../app/auth/email-verification.use-case';
import { GetProfileUseCase } from '../../../app/auth/get-profile.use-case';
import { LoginUseCase } from '../../../app/auth/login.use-case';
import { LogoutUseCase } from '../../../app/auth/logout.use-case';
import { RegisterUseCase } from '../../../app/auth/register.use-case';
import { AuthenticatedRequest } from '../middleware/auth.middleware';

const registerUseCase = new RegisterUseCase();
const loginUseCase = new LoginUseCase();
const logoutUseCase = new LogoutUseCase();
const getProfileUseCase = new GetProfileUseCase();
const emailVerificationUseCase = new EmailVerificationUseCase();

const getClientMetadata = (req: Request) => ({
  ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]
    || req.socket.remoteAddress
    || 'unknown',
  userAgent: req.headers['user-agent'] || 'unknown',
});

const sendUseCaseError = (res: Response, error: unknown, context: string): void => {
  if (error instanceof AuthUseCaseError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error(context, error);
  res.status(500).json({ error: 'Error interno del servidor' });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, token } = await registerUseCase.execute(req.body, getClientMetadata(req));

    res.status(201).json({
      message: 'Usuario registrado exitosamente. Revisa tu email para verificar tu cuenta.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currency: user.currency,
        is_email_verified: user.is_email_verified,
      },
      starter_cards: 6,
      verification_required: true,
    });
  } catch (error) {
    sendUseCaseError(res, error, 'Error en registro:');
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { user, token } = await loginUseCase.execute(
      req.body.email,
      req.body.password,
      getClientMetadata(req)
    );

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        currency: user.currency,
      },
    });
  } catch (error) {
    sendUseCaseError(res, error, 'Error en login:');
  }
};

export const getProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  res.json({ user: getProfileUseCase.execute(req.user) });
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// Página mínima para quien abre el enlace del email en el navegador
const verificationPage = (title: string, message: string) => `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:Arial,sans-serif;background:#1b1a2e;color:#eee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
main{max-width:480px;background:#2a2945;padding:32px;border-radius:12px;text-align:center}h1{margin-top:0}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;

export const verifyEmail = async (req: Request, res: Response): Promise<void> => {
  const wantsHtml = req.accepts(['json', 'html']) === 'html';

  try {
    await emailVerificationUseCase.verify(req.query.token);
    const message = '¡Email verificado exitosamente! Tu cuenta está ahora activada.';

    if (wantsHtml) {
      res.send(verificationPage('✅ Email verificado', `${message} Ya puedes volver al juego.`));
      return;
    }
    res.json({ success: true, message });
  } catch (error) {
    if (wantsHtml && error instanceof AuthUseCaseError) {
      res.status(error.statusCode).send(verificationPage(
        '❌ No se pudo verificar',
        `${error.message}. Puedes pedir un nuevo enlace desde el juego.`
      ));
      return;
    }
    sendUseCaseError(res, error, 'Error verificando email:');
  }
};

export const resendVerificationEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    await emailVerificationUseCase.resend(req.body.email);
    res.json({
      success: true,
      message: 'Si la cuenta requiere verificación, se enviará un email.',
    });
  } catch (error) {
    sendUseCaseError(res, error, 'Error reenviando email:');
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.auth) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    await logoutUseCase.execute(req.auth.userId, req.auth.sessionId);
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    sendUseCaseError(res, error, 'Error en logout:');
  }
};
