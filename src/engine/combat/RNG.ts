/**
 * RNG.ts — Generador de números pseudoaleatorios determinista con semilla.
 *
 * Algoritmo: mulberry32 (32-bit PRNG de alta calidad).
 * Mejor que Math.sin: distribuón uniforme, sin pérdida de precisión con seeds grandes.
 *
 * Uso:
 *   const rng = new SeededRNG(seedFromMatchState);
 *   const flip = rng.next() < 0.5;   // [0, 1)
 *   const newSeed = rng.getSeed();    // guardar avance
 */
export class SeededRNG {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0; // forzar uint32
  }

  /** Retorna un número en [0, 1) y avanza la semilla. */
  next(): number {
    // mulberry32
    this.seed = (this.seed + 0x6D2B79F5) | 0;
    let z = this.seed;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  }

  /** Devuelve la semilla actual (para persistir el avance). */
  getSeed(): number {
    return this.seed >>> 0;
  }
}

/**
 * Convierte un string en un número de seed uint32 (xmur3).
 * Permite derivar una seed determinista desde match_id + estado.
 *
 * Ejemplo:
 *   const seed = xmur3(`${matchId}:${currentTurn}:${graveyardTotal}`);
 */
export function xmur3(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
