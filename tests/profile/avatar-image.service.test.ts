import fs from 'fs';
import path from 'path';
import { ASSETS_DIR, AvatarImageError, AvatarImageService } from '../../src/infrastructure/assets/avatar-image.service';

describe('AvatarImageService', () => {
  test('ASSETS_DIR points at the project src/assets folder', () => {
    expect(ASSETS_DIR).toBe(path.resolve(__dirname, '../../src/assets'));
    expect(fs.existsSync(path.join(ASSETS_DIR, 'avatars'))).toBe(true);
  });

  test('reads an existing avatar image with leading slash or not', () => {
    const file = fs.readdirSync(path.join(ASSETS_DIR, 'avatars')).find((f) => f.endsWith('.png'))!;
    for (const url of [`avatars/${file}`, `/avatars/${file}`]) {
      const image = AvatarImageService.readImage(url);
      expect(image.contentType).toBe('image/png');
      expect(image.buffer.length).toBeGreaterThan(0);
    }
  });

  test('refuses to read outside the assets folder', () => {
    expect(() => AvatarImageService.readImage('../../package.json')).toThrow(AvatarImageError);
  });
});
