import { Router } from 'express';
import { authenticateToken, optionalAuthenticate } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import { economyRateLimit } from '../middleware/rate-limit.middleware';
import {
  getAvailablePacks,
  getUserPacks,
  getPacksProgress,
  buyPack,
  openPack
} from '../controllers/packs.controller';

const router = Router();

// Rutas públicas (con token, /available añade el progreso de la garantía de cada sobre)
router.get('/available', optionalAuthenticate, getAvailablePacks);

// Rutas que requieren autenticación
router.use(authenticateToken);

router.get('/my-packs', getUserPacks);
router.get('/progress', getPacksProgress);
router.post('/buy', requireEmailVerification, economyRateLimit, buyPack);
router.post('/open', requireEmailVerification, economyRateLimit, openPack);

export default router;