import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { getCurrentUser } from '../controllers/users.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

router.get('/me', getCurrentUser);

export default router;