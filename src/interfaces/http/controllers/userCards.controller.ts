import { Request, Response } from 'express';
import { CollectionService } from '../../../app/collection/collection.service';

export const getUserCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const collection = await CollectionService.getUserCards((req as any).user.id);
    res.json({ success: true, data: collection, total: collection.length });
  } catch (error) {
    console.error('Error obteniendo colección:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

export const getUserCardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const stats = await CollectionService.getUserCardStats((req as any).user.id);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};
