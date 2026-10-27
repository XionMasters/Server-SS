import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireEmailVerification } from '../middleware/emailVerification.middleware';
import * as transactionsController from '../controllers/transactions.controller';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);
router.use(requireEmailVerification);

router.get('/currency', transactionsController.getCurrencyHistory);
router.get('/cards', transactionsController.getCardHistory);
router.get('/stats', transactionsController.getTransactionStats);
router.get('/recent', transactionsController.getRecentActivity);

export default router;