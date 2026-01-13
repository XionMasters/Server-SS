import { Request, Response } from 'express';
import ChatMessage from '../models/ChatMessage';
import { Op } from 'sequelize';

export const getRecentMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const hoursAgo = parseInt(req.query.hours as string) || 2; // Por defecto 2 horas
    
    // Calcular timestamp de hace N horas
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursAgo);
    
    const messages = await ChatMessage.findAll({
      where: {
        message_type: 'global',
        created_at: {
          [Op.gte]: cutoffDate // Solo mensajes creados después de cutoffDate
        }
      },
      order: [['created_at', 'DESC']],
      limit: limit
    });
    
    // Invertir para orden cronológico
    res.json({
      messages: messages.reverse(),
      total: messages.length
    });
    
  } catch (error: any) {
    console.error('Error obteniendo mensajes:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes del chat' });
  }
};

export const getUserMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const messages = await ChatMessage.findAll({
      where: {
        [Op.or]: [
          { user_id: user.id },
          { target_user_id: user.id }
        ]
      },
      order: [['created_at', 'DESC']],
      limit: limit
    });
    
    res.json({
      messages: messages.reverse(),
      total: messages.length
    });
    
  } catch (error: any) {
    console.error('Error obteniendo mensajes privados:', error);
    res.status(500).json({ error: 'Error obteniendo mensajes privados' });
  }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { message_id } = req.params;
    
    const message = await ChatMessage.findByPk(message_id);
    
    if (!message) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }
    
    // Solo el autor o admin puede eliminar
    if (message.user_id !== user.id) {
      res.status(403).json({ error: 'No tienes permiso para eliminar este mensaje' });
      return;
    }
    
    await message.destroy();
    
    res.json({ message: 'Mensaje eliminado correctamente' });
    
  } catch (error: any) {
    console.error('Error eliminando mensaje:', error);
    res.status(500).json({ error: 'Error eliminando mensaje' });
  }
};
