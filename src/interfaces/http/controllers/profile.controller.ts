import { Request, Response } from 'express';
import { ProfileService, ProfileServiceError } from '../../../app/profile/profile.service';
import { AvatarImageError, AvatarImageService } from '../../../infrastructure/assets/avatar-image.service';

function getUserId(req: Request): string {
  return (req as any).user.id;
}

function handleError(res: Response, error: unknown, fallbackMessage: string): void {
  if (error instanceof ProfileServiceError || error instanceof AvatarImageError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error(fallbackMessage, error);
  res.status(500).json({ error: fallbackMessage });
}

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ProfileService.getProfile(getUserId(req)));
  } catch (error) {
    handleError(res, error, 'Error obteniendo perfil del usuario');
  }
};

export const getAvailableAvatars = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ProfileService.getAvailableAvatars(getUserId(req)));
  } catch (error) {
    handleError(res, error, 'Error obteniendo avatares disponibles');
  }
};

export const updateAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await ProfileService.updateAvatar(getUserId(req), req.body.avatar_id);
    res.json(result);
  } catch (error) {
    handleError(res, error, 'Error actualizando avatar');
  }
};

export const checkCardUnlocks = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ProfileService.checkCardUnlocks(getUserId(req)));
  } catch (error) {
    handleError(res, error, 'Error verificando desbloqueos de avatares');
  }
};

export const getAvatarImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: 'ID de avatar requerido' });
      return;
    }

    const image = await AvatarImageService.readImageForAvatar(id);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(image.buffer);
  } catch (error) {
    handleError(res, error, 'Error obteniendo imagen de avatar');
  }
};

export const getPublicProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ProfileService.getPublicProfile(req.params.userId));
  } catch (error) {
    handleError(res, error, 'Error obteniendo perfil del usuario');
  }
};

export const getAvailableDeckBacks = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await ProfileService.getAvailableDeckBacks(getUserId(req)));
  } catch (error) {
    handleError(res, error, 'Error obteniendo dorsos disponibles');
  }
};

export const updateDeckBack = async (req: Request, res: Response): Promise<void> => {
  try {
    const { deck_id, deck_back_id } = req.body;
    res.json(await ProfileService.updateDeckBack(getUserId(req), deck_id, deck_back_id));
  } catch (error) {
    handleError(res, error, 'Error actualizando dorso');
  }
};
