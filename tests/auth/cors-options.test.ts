import { createCorsOptions } from '../../src/interfaces/http/cors-options';

describe('createCorsOptions', () => {
  it('allows configured origins and requests without Origin', () => {
    const options = createCorsOptions('https://app.example.com,http://localhost:3000');
    const origin = options.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => void;

    origin('https://app.example.com', (error, allow) => {
      expect(error).toBeNull();
      expect(allow).toBe(true);
    });

    origin(undefined, (error, allow) => {
      expect(error).toBeNull();
      expect(allow).toBe(true);
    });
  });

  it('rejects origins outside the allowlist', () => {
    const options = createCorsOptions('https://app.example.com');
    const origin = options.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => void;

    origin('https://untrusted.example.com', (error) => {
      expect(error).toHaveProperty('message', 'Origen no permitido por CORS');
    });
  });
});
