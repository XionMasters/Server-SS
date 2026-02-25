// src/routes/matches.routes.ts
import { Router } from 'express';
import * as matchesController from '../controllers/matches.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();
const DEPRECATION_SUNSET = 'Wed, 31 Dec 2026 23:59:59 GMT';

function withDeprecationNotice(handler: any, message: string) {
	return [
		(req: any, res: any, next: any) => {
			res.setHeader('Deprecation', 'true');
			res.setHeader('Sunset', DEPRECATION_SUNSET);
			res.setHeader('Warning', `299 - \"${message}\"`);
			next();
		},
		handler
	];
}

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Verificar si puede buscar partida
router.get('/can-search', matchesController.canSearchMatch);

// TEST Match
router.post(
	'/init-match-test',
	...withDeprecationNotice(matchesController.startTestMatch, 'Deprecated HTTP endpoint. Use WebSocket event request_test_match.')
);
router.get('/test/resume', matchesController.resumeTestMatch);

// Matchmaking y gestión de partidas
router.post(
	'/find',
	...withDeprecationNotice(matchesController.findMatch, 'Deprecated HTTP endpoint. Use WebSocket event search_match.')
);
router.post(
	'/cancel-search',
	...withDeprecationNotice(matchesController.cancelSearch, 'Deprecated HTTP endpoint. Use WebSocket event cancel_search.')
);
router.get('/:id', matchesController.getMatchState);
router.post(
	'/:id/play-card',
	...withDeprecationNotice(matchesController.playCard, 'Deprecated HTTP endpoint. Use WebSocket event play_card.')
);
router.post(
	'/:id/pass-turn',
	...withDeprecationNotice(matchesController.passTurn, 'Deprecated HTTP endpoint. Use WebSocket event end_turn.')
);
router.post('/:id/abandon', matchesController.abandonMatch);

// ⚔️ Sistema de combate
router.post(
	'/:id/attack',
	...withDeprecationNotice(matchesController.attackKnight, 'Deprecated HTTP endpoint. Use WebSocket event attack.')
);
router.post(
	'/:id/change-mode',
	...withDeprecationNotice(matchesController.changeDefensiveMode, 'Deprecated HTTP endpoint. Use WebSocket event change_defensive_mode.')
);

// 🎮 Inicialización de turno
router.post(
	'/:id/start-first-turn',
	...withDeprecationNotice(matchesController.startFirstTurn, 'Deprecated HTTP endpoint. Use WebSocket game flow initialization.')
);

export default router;
