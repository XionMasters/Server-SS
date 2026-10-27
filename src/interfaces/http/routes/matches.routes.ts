import { Router } from 'express';
import * as matchesController from '../controllers/matches.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';

const router = Router();
const DEPRECATION_SUNSET = 'Wed, 31 Dec 2026 23:59:59 GMT';

function disableLegacyMatchmaking(_req: any, res: any): void {
	res.setHeader('Deprecation', 'true');
	res.setHeader('Sunset', DEPRECATION_SUNSET);
	res.setHeader('Warning', '299 - "Use WebSocket events search_match and cancel_search instead."');
	res.status(410).json({
		error: 'El matchmaking HTTP ya no está disponible. Usa los eventos WebSocket search_match y cancel_search.'
	});
}

router.use(authenticateToken);
router.use(requireEmailVerification);

router.post('/init-match-test', matchesController.startTestMatch);
router.get('/test/resume', matchesController.resumeTestMatch);

router.post('/find', disableLegacyMatchmaking);
router.post('/cancel-search', disableLegacyMatchmaking);
router.get('/:id', matchesController.getMatchState);

router.post('/:id/abandon', matchesController.abandonMatch);

export default router;
