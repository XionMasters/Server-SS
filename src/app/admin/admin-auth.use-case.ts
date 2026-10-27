import { createHash, timingSafeEqual } from 'crypto';
import { createAdminAccessToken, getAdminPassword } from '../../infrastructure/auth/token.service';

// Comparar hashes de longitud fija evita filtrar la longitud de la contraseña
const digest = (value: string) => createHash('sha256').update(value).digest();

export const isValidAdminPassword = (candidate: unknown, expected: string): boolean =>
  typeof candidate === 'string' && timingSafeEqual(digest(candidate), digest(expected));

/** Devuelve un token de admin, o null si la contraseña no coincide. */
export const loginAdmin = (password: unknown): string | null =>
  isValidAdminPassword(password, getAdminPassword()) ? createAdminAccessToken() : null;
