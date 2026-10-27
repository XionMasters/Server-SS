import { Router } from 'express';
import { getCard, getCardSummary, listCards } from '../controllers/cards.controller';

const router = Router();

// Rutas públicas de solo lectura del catálogo de cartas
router.get('/', listCards);
router.get('/stats/summary', getCardSummary);
router.get('/:id', getCard);

export default router;
