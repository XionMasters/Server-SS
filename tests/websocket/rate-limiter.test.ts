import { SocketRateLimiter } from '../../src/infrastructure/websocket/rate-limiter';

describe('SocketRateLimiter', () => {
  const options = { maxEvents: 3, windowMs: 1_000, maxStrikes: 2 };

  test('allows events up to the limit within the window', () => {
    let now = 0;
    const limiter = new SocketRateLimiter(options, () => now);

    expect([limiter.check(), limiter.check(), limiter.check()]).toEqual(['allow', 'allow', 'allow']);
    expect(limiter.check()).toBe('reject');

    now += 1_000;
    expect(limiter.check()).toBe('allow');
  });

  test('disconnects after exceeding the limit in several windows', () => {
    let now = 0;
    const limiter = new SocketRateLimiter(options, () => now);

    for (let i = 0; i < 3; i++) limiter.check();
    expect(limiter.check()).toBe('reject');
    expect(limiter.check()).toBe('reject'); // mismo aviso en la misma ventana

    now += 1_000;
    for (let i = 0; i < 3; i++) limiter.check();
    expect(limiter.check()).toBe('disconnect');
  });

  test('forgives earlier strikes after a full clean window', () => {
    let now = 0;
    const limiter = new SocketRateLimiter(options, () => now);

    for (let i = 0; i < 4; i++) limiter.check(); // 1 aviso
    now += 2_500;
    expect(limiter.check()).toBe('allow'); // ventana limpia: se perdona

    for (let i = 0; i < 2; i++) limiter.check();
    expect(limiter.check()).toBe('reject'); // vuelve a ser el primer aviso, no desconecta
  });
});
