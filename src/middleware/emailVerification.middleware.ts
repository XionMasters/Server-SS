// src/middleware/emailVerification.middleware.ts
import { Request, Response, NextFunction } from 'express';

export interface VerifiedRequest extends Request {
  user?: any;
}

export const requireEmailVerification = async (
  req: VerifiedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const user = req.user;

    if (!user) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    if (!user.is_email_verified) {
      res.status(403).json({ 
        error: 'Email no verificado',
        message: 'Debes verificar tu email antes de acceder a esta función',
        verification_required: true
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Error en verificación de email:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};