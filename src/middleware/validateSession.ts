// src/middleware/validateSession.ts
import { Request, Response, NextFunction } from 'express';
import UserSession from '../models/UserSession';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    username: string;
  };
}

export const validateSession = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !req.user.userId) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    // Obtener el token del header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Token no encontrado' });
      return;
    }

    const token = authHeader.substring(7); // Remover "Bearer "

    // Buscar la sesión activa con este token
    const session = await UserSession.findOne({
      where: {
        user_id: req.user.userId,
        token: token,
        is_active: true
      }
    });

    if (!session) {
      console.warn(`⚠️ Intento de acceso con token inválido o sesión cerrada. Usuario: ${req.user.username}`);
      res.status(401).json({ 
        error: 'Sesión inválida. Tu sesión fue cerrada desde otra ubicación.',
        code: 'SESSION_INVALIDATED'
      });
      return;
    }

    // Verificar que no esté expirada
    if (session.expires_at && new Date() > session.expires_at) {
      console.warn(`⚠️ Token expirado. Usuario: ${req.user.username}`);
      await session.update({ is_active: false });
      res.status(401).json({ 
        error: 'Tu sesión ha expirado',
        code: 'SESSION_EXPIRED'
      });
      return;
    }

    // Todo bien, continuar
    next();
  } catch (error) {
    console.error('Error validando sesión:', error);
    res.status(500).json({ error: 'Error validando sesión' });
  }
};

export default validateSession;
