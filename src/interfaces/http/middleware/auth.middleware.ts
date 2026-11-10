// src/interfaces/http/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../../../infrastructure/database/models/User';
import { getActiveUserSession } from '../../../infrastructure/auth/session.service';
import { verifyUserAccessToken } from '../../../infrastructure/auth/token.service';

export interface AuthenticatedRequest extends Request {
  user?: User;
  auth?: {
    userId: string;
    username: string;
    sessionId: string;
  };
}

/**
 * Autenticación opcional: si llega un token válido deja `req.user`; si no hay token o no es
 * válido, sigue sin usuario (nunca responde 401). Para rutas públicas que añaden datos del jugador.
 */
export const optionalAuthenticate = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
      const decoded = verifyUserAccessToken(token);
      const session = await getActiveUserSession(decoded.userId, decoded.sessionId, token);
      if (session) {
        const user = await User.findByPk(decoded.userId, {
          attributes: { exclude: ['password_hash', 'email_verification_token'] }
        });
        if (user && !user.blocked_at) req.user = user;
      }
    }
  } catch {
    // Token caducado o inválido: la ruta sigue siendo pública
  }
  next();
};

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: 'Token de acceso requerido' });
      return;
    }

    const decoded = verifyUserAccessToken(token);
    const session = await getActiveUserSession(decoded.userId, decoded.sessionId, token);

    if (!session) {
      res.status(401).json({
        error: 'Sesión inválida o cerrada',
        code: 'SESSION_INVALIDATED'
      });
      return;
    }
    
    // Buscar usuario en la base de datos
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash', 'email_verification_token'] }
    });

    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado' });
      return;
    }

    if (user.blocked_at) {
      res.status(403).json({ error: 'Tu cuenta ha sido bloqueada', code: 'USER_BLOCKED' });
      return;
    }

    req.user = user;
    req.auth = {
      userId: decoded.userId,
      username: decoded.username,
      sessionId: decoded.sessionId,
    };
    next();
  } catch (error: any) {
    console.error('Error en autenticación:', error);
    
    // Diferenciamos entre token expirado e inválido
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ 
        error: 'Token expirado',
        expiredAt: error.expiredAt,
        code: 'TOKEN_EXPIRED'
      });
      return;
    }
    
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ 
        error: 'Token inválido',
        code: 'TOKEN_INVALID'
      });
      return;
    }
    
    // Otros errores
    res.status(401).json({ 
      error: 'No autorizado',
      code: 'UNAUTHORIZED'
    });
  }
};