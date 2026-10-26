// src/interfaces/http/middleware/validateSession.ts
import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth.middleware';

export const validateSession = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.auth) {
      res.status(401).json({ error: 'No autenticado' });
      return;
    }

    next();
  } catch (error) {
    console.error('Error validando sesión:', error);
    res.status(500).json({ error: 'Error validando sesión' });
  }
};

export default validateSession;
