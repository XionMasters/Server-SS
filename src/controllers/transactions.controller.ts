// src/controllers/transactions.controller.ts
import { Request, Response } from 'express';
import transactionService from '../services/transactionService';

/**
 * Obtener historial de transacciones de monedas del usuario
 */
export const getCurrencyHistory = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * Obtener historial de transacciones de cartas del usuario
 */
export const getCardHistory = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * Obtener estadísticas generales de transacciones del usuario
 */
export const getTransactionStats = async (req: Request, res: Response): Promise<void> => {
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
};

/**
 * Obtener actividad reciente (últimas 24 horas)
 */
export const getRecentActivity = async (req: Request, res: Response): Promise<void> => {
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
};
