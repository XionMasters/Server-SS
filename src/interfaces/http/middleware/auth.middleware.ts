// src/interfaces/http/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../../../models/User';
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