// src/routes/matches.routes.ts
import { Router } from 'express';
import * as matchesController from '../controllers/matches.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Verificar si puede buscar partida
router.get('/can-search', matchesController.canSearchMatch);

// TEST Match
router.post('/test', matchesController.startTestMatch);

// Matchmaking y gestión de partidas
router.post('/find', matchesController.findMatch);
router.post('/cancel-search', matchesController.cancelSearch);
router.get('/:id', matchesController.getMatchState);
router.post('/:id/play-card', matchesController.playCard);
router.post('/:id/pass-turn', matchesController.passTurn);

// ⚔️ Sistema de combate
router.post('/:id/attack', matchesController.attackKnight);
router.post('/:id/change-mode', matchesController.changeDefensiveMode);

// 🎮 Inicialización de turno
router.post('/:id/start-first-turn', matchesController.startFirstTurn);

export default router;
