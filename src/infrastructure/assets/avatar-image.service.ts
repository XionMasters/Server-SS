import fs from 'fs';
import path from 'path';
import ProfileAvatar from '../database/models/ProfileAvatar';

// src/infrastructure/assets → raíz del proyecto (igual desde dist/infrastructure/assets).
// Antes subía un nivel de más, buscaba fuera del proyecto y todas las imágenes daban 404.
export const ASSETS_DIR = path.resolve(__dirname, '../../../src/assets');

export class AvatarImageService {
  static async readImageForAvatar(avatarId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const avatar = await ProfileAvatar.findByPk(avatarId);
    if (!avatar) {
      throw new AvatarImageError(404, 'Avatar no encontrado');
    }

    return this.readImage(avatar.image_url);
  }

  static readImage(imageUrl: string): { buffer: Buffer; contentType: string } {
    const imagePath = path.resolve(ASSETS_DIR, imageUrl.replace(/^\/+/, ''));

    // image_url viene de la BD, pero nunca debe poder leer fuera de los assets
    if (!imagePath.startsWith(ASSETS_DIR + path.sep)) {
      throw new AvatarImageError(404, 'Imagen de avatar no encontrada');
    }

    if (!fs.existsSync(imagePath)) {
      throw new AvatarImageError(404, 'Imagen de avatar no encontrada');
    }

    const buffer = fs.readFileSync(imagePath);
    return {
      buffer,
      contentType: this.detectContentType(buffer),
    };
  }

  private static detectContentType(buffer: Buffer): string {
    const isPng = buffer.length >= 8
      && buffer[0] === 0x89 && buffer[1] === 0x50
      && buffer[2] === 0x4e && buffer[3] === 0x47
      && buffer[4] === 0x0d && buffer[5] === 0x0a
      && buffer[6] === 0x1a && buffer[7] === 0x0a;
    const isJpeg = buffer.length >= 3
      && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isWebp = buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WEBP';

    if (isPng) return 'image/png';
    if (isJpeg) return 'image/jpeg';
    if (isWebp) return 'image/webp';
    return 'application/octet-stream';
  }
}

export class AvatarImageError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AvatarImageError';
  }
}
