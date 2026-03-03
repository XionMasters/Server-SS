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

router.post('/:id/abandon', matchesController.abandonMatch);

export default router;
