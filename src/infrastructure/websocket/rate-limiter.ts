// Limitador de eventos por socket (ventana deslizante).
// Protege al servidor de clientes que inundan el WebSocket (F10).

export interface SocketRateLimitOptions {
  /** Eventos permitidos por ventana. */
  maxEvents: number;
  /** Tamaño de la ventana en ms. */
  windowMs: number;
  /** Ventanas consecutivas excedidas antes de cerrar la conexión. */
  maxStrikes: number;
}

export const DEFAULT_SOCKET_RATE_LIMIT: SocketRateLimitOptions = {
  maxEvents: 30,
  windowMs: 5_000,
  maxStrikes: 3,
};

export type RateLimitDecision = 'allow' | 'reject' | 'disconnect';

export class SocketRateLimiter {
  private timestamps: number[] = [];
  private strikes = 0;
  private lastStrikeWindow = -1;

  constructor(
    private readonly options: SocketRateLimitOptions = DEFAULT_SOCKET_RATE_LIMIT,
    private readonly now: () => number = Date.now
  ) {}

  check(): RateLimitDecision {
    const now = this.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.options.windowMs);

    if (this.timestamps.length < this.options.maxEvents) {
      this.timestamps.push(now);
      // Una ventana completa sin excesos (después de la del aviso) perdona los avisos
      if (this.lastStrikeWindow >= 0 && now - this.lastStrikeWindow >= 2 * this.options.windowMs) {
        this.strikes = 0;
        this.lastStrikeWindow = -1;
      }
      return 'allow';
    }

    // Cuenta como mucho un aviso por ventana
    if (this.lastStrikeWindow < 0 || now - this.lastStrikeWindow >= this.options.windowMs) {
      this.strikes++;
      this.lastStrikeWindow = now;
    }

    return this.strikes >= this.options.maxStrikes ? 'disconnect' : 'reject';
  }
}
