import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { economyRateLimit } from '../middleware/rate-limit.middleware';
import {
  getAvailablePacks,
  getUserPacks,
  buyPack,
  openPack
} from '../controllers/packs.controller';

const router = Router();

// Rutas públicas
router.get('/available', getAvailablePacks);

// Rutas que requieren autenticación
router.use(authenticateToken);

router.get('/my-packs', getUserPacks);
router.post('/buy', requireEmailVerification, economyRateLimit, buyPack);
router.post('/open', requireEmailVerification, economyRateLimit, openPack);

export default router;