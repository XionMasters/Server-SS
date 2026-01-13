// src/middleware/auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'tu_clave_secreta_muy_segura';

export interface AuthRequest extends Request {
  user?: any;
}

export const authenticateToken = async (
  req: AuthRequest,
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

    const decoded: any = jwt.verify(token, JWT_SECRET);
    
    // Buscar usuario en la base de datos
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash', 'email_verification_token'] }
    });

    if (!user) {
      res.status(401).json({ error: 'Usuario no encontrado' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Error en autenticación:', error);
    res.status(403).json({ error: 'Token inválido o expirado' });
  }
};