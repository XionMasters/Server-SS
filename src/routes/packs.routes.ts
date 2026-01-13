// src/routes/packs.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
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
router.post('/buy', buyPack);
router.post('/open', openPack);

export default router;