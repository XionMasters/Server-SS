import { Router } from 'express';
import {
  authenticateAdmin,
  createCard,
  deleteCard,
  getCard,
  inspectMatch,
  listActiveMatches,
  listCards,
  updateCard,
} from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/admin.middleware';
import { adminAuthRateLimit } from '../middleware/rate-limit.middleware';

// API del panel admin, montada en /api/admin
const router = Router();

router.post('/auth', adminAuthRateLimit, authenticateAdmin);

// Match Inspector
router.get('/matches', requireAdmin, listActiveMatches);
router.get('/matches/:id', requireAdmin, inspectMatch);

// Card Manager CRUD
router.get('/cards', requireAdmin, listCards);
router.get('/cards/:cardId', requireAdmin, getCard);
router.post('/cards', requireAdmin, createCard);
router.put('/cards/:cardId', requireAdmin, updateCard);
router.delete('/cards/:cardId', requireAdmin, deleteCard);

export default router;
