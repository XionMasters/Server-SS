// src/routes/transactions.routes.ts
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import transactionService from '../services/transactionService';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Obtener historial de transacciones de monedas
router.get('/currency', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await transactionService.getUserCurrencyHistory(userId, limit, offset);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit,
        offset,
        total: transactions.length
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de monedas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener historial de transacciones de cartas
router.get('/cards', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const transactions = await transactionService.getUserCardHistory(userId, limit, offset);

    res.json({
      success: true,
      data: transactions,
      pagination: {
        limit,
        offset,
        total: transactions.length
      }
    });

  } catch (error) {
    console.error('Error obteniendo historial de cartas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener estadísticas de transacciones
router.get('/stats', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const stats = await transactionService.getUserTransactionStats(userId);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

// Obtener actividad reciente (últimas 24 horas)
router.get('/recent', async (req, res) => {
  try {
    const userId = (req as any).user.id;
    const activity = await transactionService.getRecentActivity(userId);

    res.json({
      success: true,
      data: activity
    });

  } catch (error) {
    console.error('Error obteniendo actividad reciente:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
});

export default router;