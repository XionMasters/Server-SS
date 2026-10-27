import { Request, Response } from 'express';
import { GetCurrentUserUseCase } from '../../../app/users/get-current-user.use-case';

const getCurrentUserUseCase = new GetCurrentUserUseCase();

export const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await getCurrentUserUseCase.execute((req as any).user.id);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error obteniendo perfil de usuario' });
  }
};
