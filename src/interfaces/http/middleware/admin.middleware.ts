import { NextFunction, Request, Response } from 'express';
import { verifyAdminAccessToken } from '../../../infrastructure/auth/token.service';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Token requerido' }); return; }
  try {
    const payload = verifyAdminAccessToken(token);
    if (payload.role !== 'admin') { res.status(403).json({ error: 'Acceso denegado' }); return; }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}
