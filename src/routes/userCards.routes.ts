// src/routes/userCards.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { 
  getUserCards, 
  addUserCard, 
  getUserCardStats 
} from '../controllers/userCards.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

router.get('/', getUserCards);
router.post('/', addUserCard);
router.get('/stats', getUserCardStats);

export default router;