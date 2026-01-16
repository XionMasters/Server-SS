import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getProfile,
  getAvailableAvatars,
  updateAvatar,
  checkCardUnlocks,
  getAvatarImage,
  getPublicProfile
} from '../controllers/profile.controller';

const router = express.Router();

// Ruta pública para obtener imagen de avatar
router.get('/avatar/:id/image', getAvatarImage);

// Ruta pública para obtener perfil/avatar de cualquier usuario
router.get('/user/:userId', getPublicProfile);

// Todas las rutas siguientes requieren autenticación
router.use(authenticateToken);

// Obtener perfil del usuario
router.get('/', getProfile);

// Obtener avatares disponibles (desbloqueados y bloqueados)
router.get('/avatars', getAvailableAvatars);

// Cambiar avatar actual
router.put('/avatar', updateAvatar);

// Verificar y desbloquear avatares por cartas obtenidas
router.post('/check-unlocks', checkCardUnlocks);

export default router;
