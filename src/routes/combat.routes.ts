// src/routes/combat.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { executeBasicAttack, executeChargeKnightAction } from '../controllers/combat.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Ejecutar ataque básico (BA)
router.post('/attack', executeBasicAttack);

// Ejecutar acciones de caballero (charge, evade, block, sacrifice)
router.post('/knight-action', executeChargeKnightAction);

export default router;
