// src/routes/userCards.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../interfaces/http/middleware/auth.middleware';
import {
  getUserCards,
  getUserCardStats
} from '../controllers/userCards.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

router.get('/', getUserCards);
router.get('/stats', getUserCardStats);

export default router;