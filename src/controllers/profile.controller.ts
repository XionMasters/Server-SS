import { Request, Response } from 'express';
import UserProfile from '../models/UserProfile';
import ProfileAvatar from '../models/ProfileAvatar';
import UserAvatarUnlock from '../models/UserAvatarUnlock';
import Card from '../models/Card';
import UserCard from '../models/UserCard';
import path from 'path';
import fs from 'fs';

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    
    let profile = await UserProfile.findOne({
      where: { user_id: user.id }
    });
    
    // Si no existe perfil, crear uno por defecto
    if (!profile) {
      const defaultAvatar = await ProfileAvatar.findOne({
        where: { unlock_type: 'default', is_active: true }
      });
      
      if (defaultAvatar) {
        profile = await UserProfile.create({
          user_id: user.id,
          avatar_image_id: defaultAvatar.id
        });
        
        // Desbloquear avatar por defecto
        await UserAvatarUnlock.create({
          user_id: user.id,
          avatar_id: defaultAvatar.id,
          unlock_source: 'initial_setup'
        });
      }
    }
    
    // Cargar avatar manualmente y construir URL absoluta
    let avatarData: any = null;
    if (profile && profile.avatar_image_id) {
      const avatarRecord = await ProfileAvatar.findByPk(profile.avatar_image_id);
      if (avatarRecord) {
        avatarData = {
          ...avatarRecord.toJSON(),
          image_url: `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/profile/avatar/${avatarRecord.id}/image`
        };
      }
    }
    
    res.json({
      profile: {
        ...(profile?.toJSON() || {}),
        avatar: avatarData
      },
      message: 'Perfil obtenido correctamente'
    });
    
  } catch (error: any) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error obteniendo perfil del usuario' });
  }
};

export const getAvailableAvatars = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    
    // Obtener IDs de avatares desbloqueados
    const unlockedAvatars = await UserAvatarUnlock.findAll({
      where: { user_id: user.id }
    });
    
    const unlockedIds = unlockedAvatars.map(u => u.avatar_id);
    
    // Obtener todos los avatares activos con info de desbloqueo
    const allAvatars = await ProfileAvatar.findAll({
      where: { is_active: true }
      // Note: required_card_id FK exists but Card association not properly configured
    });
    
    const avatarsWithStatus = allAvatars.map(avatar => ({
      ...avatar.toJSON(),
      is_unlocked: unlockedIds.includes(avatar.id),
      image_url: `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/profile/avatar/${avatar.id}/image`
    }));
    
    res.json({
      avatars: avatarsWithStatus,
      message: 'Avatares disponibles obtenidos'
    });
    
  } catch (error: any) {
    console.error('Error obteniendo avatares:', error);
    res.status(500).json({ error: 'Error obteniendo avatares disponibles' });
  }
};

export const updateAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { avatar_id } = req.body;
    
    if (!avatar_id) {
      res.status(400).json({ error: 'avatar_id es requerido' });
      return;
    }
    
    // Verificar que el usuario tiene desbloqueado el avatar
    const unlocked = await UserAvatarUnlock.findOne({
      where: {
        user_id: user.id,
        avatar_id: avatar_id
      }
    });
    
    if (!unlocked) {
      res.status(403).json({ error: 'No tienes desbloqueado este avatar' });
      return;
    }
    
    // Actualizar perfil
    const [profile, created] = await UserProfile.findOrCreate({
      where: { user_id: user.id },
      defaults: {
        user_id: user.id,
        avatar_image_id: avatar_id
      }
    });
    
    if (!created) {
      await profile.update({ avatar_image_id: avatar_id });
    }
    
    res.json({
      profile,
      message: 'Avatar actualizado correctamente'
    });
    
  } catch (error: any) {
    console.error('Error actualizando avatar:', error);
    res.status(500).json({ error: 'Error actualizando avatar' });
  }
};

export const checkCardUnlocks = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    
    // Obtener cartas legendarias del usuario
    const userLegendaryCards = await UserCard.findAll({
      where: { user_id: user.id },
      include: [{
        model: Card,
        as: 'card',
        where: { rarity: 'legendaria' }
      }]
    });
    
    const legendaryCardIds = userLegendaryCards.map((uc: any) => uc.card_id);
    
    // Obtener avatares que se desbloquean con cartas legendarias que el usuario tiene
    const avatarsToUnlock = await ProfileAvatar.findAll({
      where: {
        unlock_type: 'card_unlock',
        required_card_id: legendaryCardIds,
        is_active: true
      }
    });
    
    const newUnlocks = [];
    
    for (const avatar of avatarsToUnlock) {
      // Verificar si ya está desbloqueado
      const existing = await UserAvatarUnlock.findOne({
        where: {
          user_id: user.id,
          avatar_id: avatar.id
        }
      });
      
      if (!existing) {
        const unlock = await UserAvatarUnlock.create({
          user_id: user.id,
          avatar_id: avatar.id,
          unlock_source: 'card_legendary_obtained'
        });
        
        newUnlocks.push({
          avatar,
          unlock
        });
      }
    }
    
    res.json({
      new_unlocks: newUnlocks,
      message: newUnlocks.length > 0 ? 
        `¡${newUnlocks.length} nuevo(s) avatar(es) desbloqueado(s)!` : 
        'No hay nuevos avatares para desbloquear'
    });
    
  } catch (error: any) {
    console.error('Error verificando desbloqueos:', error);
    res.status(500).json({ error: 'Error verificando desbloqueos de avatares' });
  }
};

export const getAvatarImage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    if (!id) {
      res.status(400).json({ error: 'ID de avatar requerido' });
      return;
    }
    
    // Buscar avatar en BD
    const avatar = await ProfileAvatar.findByPk(id);
    
    if (!avatar) {
      res.status(404).json({ error: 'Avatar no encontrado' });
      return;
    }
    
    // Construir ruta del archivo (image_url está como 'avatars/avatar_1.png')
    const imagePath = path.join(__dirname, '../../src/assets', avatar.image_url);
    
    // Verificar que el archivo exista
    if (!fs.existsSync(imagePath)) {
      console.error(`Imagen de avatar no encontrada: ${imagePath}`);
      res.status(404).json({ error: 'Imagen de avatar no encontrada' });
      return;
    }
    
    // Leer buffer completo y detectar formato real por magic numbers
    const buffer = fs.readFileSync(imagePath);
    let contentType = 'application/octet-stream';
    // PNG signature
    const isPng = buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 && buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A;
    // JPEG signature
    const isJpeg = buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    // WEBP signature (RIFF....WEBP)
    const isWebp = buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
    if (isPng) contentType = 'image/png';
    else if (isJpeg) contentType = 'image/jpeg';
    else if (isWebp) contentType = 'image/webp';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.end(buffer);
    
  } catch (error: any) {
    console.error('Error obteniendo imagen de avatar:', error);
    res.status(500).json({ error: 'Error obteniendo imagen de avatar' });
  }
};
