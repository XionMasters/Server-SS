import { CorsOptions } from 'cors';

export const createCorsOptions = (originsValue: string | undefined): CorsOptions => {
  const allowedOrigins = originsValue
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origen no permitido por CORS'));
    },
  };
};
