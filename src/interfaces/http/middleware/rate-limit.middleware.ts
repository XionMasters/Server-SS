import { rateLimit } from 'express-rate-limit';

const standardHeaders = 'draft-8';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta nuevamente más tarde.' },
});

// Contador propio para no compartir cupo con el login de usuarios
export const adminAuthRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Intenta nuevamente más tarde.' },
});

export const economyRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders,
  legacyHeaders: false,
  message: { error: 'Demasiadas operaciones económicas. Intenta nuevamente más tarde.' },
});
