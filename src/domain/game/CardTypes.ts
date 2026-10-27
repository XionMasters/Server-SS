/**
 * Tipos de carta canónicos del motor.
 *
 * La BD conserva valores en español de las importaciones antiguas
 * ('caballero', 'tecnica', 'objeto'...) y el enum admite ambos idiomas.
 * Todo el código del servidor compara contra estos valores en inglés, así que
 * cualquier tipo leído de la BD debe pasar por normalizeCardType.
 */
export type CardType = 'knight' | 'technique' | 'object' | 'stage' | 'helper' | 'occasion';

const ALIASES: Record<string, CardType> = {
  knight: 'knight',
  caballero: 'knight',
  technique: 'technique',
  tecnica: 'technique',
  'técnica': 'technique',
  object: 'object',
  objeto: 'object',
  item: 'object',
  stage: 'stage',
  escenario: 'stage',
  helper: 'helper',
  ayudante: 'helper',
  occasion: 'occasion',
  ocasion: 'occasion',
  'ocasión': 'occasion',
  event: 'occasion',
};

/** Devuelve el tipo canónico; los valores desconocidos se devuelven tal cual (en minúsculas). */
export function normalizeCardType(type: string | null | undefined): string {
  const key = String(type ?? '').trim().toLowerCase();
  return ALIASES[key] ?? key;
}
