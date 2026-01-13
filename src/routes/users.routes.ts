// src/routes/users.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import User from '../models/User';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

router.get('/me', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password_hash', 'email_verification_token', 'email_verification_expires'] }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error obteniendo perfil de usuario' });
  }
});

// Aquí agregaremos más rutas: mazos, colección, etc.

export default router;