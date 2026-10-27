// Validación del cuerpo de POST/PUT /api/admin/cards.
// Solo se aceptan campos conocidos y con el tipo correcto; el resto se descarta.
import { CardAdminError, CardRecord } from './card-admin';

export const CARD_TYPES = ['knight', 'technique', 'object', 'stage', 'helper', 'occasion'] as const;
export const CARD_RARITIES = ['common', 'rare', 'epic', 'legendary', 'divine'] as const;
export const CARD_ELEMENTS = ['steel', 'fire', 'water', 'earth', 'wind', 'light', 'dark'] as const;

type FieldKind = 'string' | 'text' | 'int' | 'bool' | 'stringArray';

const CARD_FIELDS: Record<string, { kind: FieldKind; max?: number; nullable?: boolean; values?: readonly string[] }> = {
  code: { kind: 'string', max: 100 },
  name: { kind: 'string', max: 100 },
  type: { kind: 'string', values: CARD_TYPES },
  rarity: { kind: 'string', values: CARD_RARITIES },
  cost: { kind: 'int' },
  generate: { kind: 'int' },
  description: { kind: 'text', nullable: true },
  image_url: { kind: 'string', max: 255, nullable: true },
  faction: { kind: 'string', max: 50, nullable: true },
  element: { kind: 'string', values: CARD_ELEMENTS, nullable: true },
  max_copies: { kind: 'int' },
  unique: { kind: 'bool' },
  playable_zones: { kind: 'stringArray', nullable: true },
  collection_id: { kind: 'string', max: 50, nullable: true },
  artist: { kind: 'string', max: 100, nullable: true },
  language: { kind: 'string', max: 10, nullable: true },
  balance_notes: { kind: 'text', nullable: true },
  power_level: { kind: 'int', nullable: true },
  tags: { kind: 'stringArray', nullable: true },
  card_set: { kind: 'string', max: 100, nullable: true },
  release_year: { kind: 'int', nullable: true },
  notes: { kind: 'text', nullable: true },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function checkField(field: string, value: unknown, errors: string[]): void {
  const rule = CARD_FIELDS[field];
  if (value === null) {
    if (!rule.nullable) errors.push(`${field} no puede ser null`);
    return;
  }

  switch (rule.kind) {
    case 'string':
    case 'text':
      if (typeof value !== 'string') {
        errors.push(`${field} debe ser texto`);
      } else if (rule.max !== undefined && value.length > rule.max) {
        errors.push(`${field} supera ${rule.max} caracteres`);
      } else if (rule.values && !rule.values.includes(value)) {
        errors.push(`${field} debe ser uno de: ${rule.values.join(', ')}`);
      }
      return;
    case 'int':
      if (!Number.isInteger(value) || (value as number) < 0) errors.push(`${field} debe ser un entero >= 0`);
      return;
    case 'bool':
      if (typeof value !== 'boolean') errors.push(`${field} debe ser booleano`);
      return;
    case 'stringArray':
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        errors.push(`${field} debe ser una lista de textos`);
      }
      return;
  }
}

function checkNumericObject(label: string, value: Record<string, unknown>, errors: string[]): void {
  for (const [key, v] of Object.entries(value)) {
    if (v !== null && typeof v !== 'number' && typeof v !== 'boolean' && typeof v !== 'string') {
      errors.push(`${label}.${key} tiene un tipo no válido`);
    }
  }
}

/**
 * Valida y normaliza el cuerpo. En creación exige code, name, type y rarity.
 * Lanza CardAdminError(400) con la lista de errores.
 */
export function validateCardBody(body: unknown, mode: 'create' | 'update'): CardRecord {
  if (!isPlainObject(body)) {
    throw new CardAdminError(400, 'El cuerpo debe ser un objeto JSON');
  }

  const errors: string[] = [];
  const result: CardRecord = {};

  for (const field of Object.keys(CARD_FIELDS)) {
    if (body[field] === undefined) continue;
    checkField(field, body[field], errors);
    result[field] = body[field];
  }

  if (body.translations !== undefined) {
    if (!isPlainObject(body.translations)) {
      errors.push('translations debe ser un objeto');
    } else {
      const translations: Record<string, unknown> = {};
      for (const lang of ['es', 'en', 'pt']) {
        const t = body.translations[lang];
        if (t === undefined) continue;
        if (!isPlainObject(t) || (t.name !== undefined && typeof t.name !== 'string')) {
          errors.push(`translations.${lang} no es válido`);
          continue;
        }
        if (typeof t.name === 'string' && t.name.length > 100) errors.push(`translations.${lang}.name supera 100 caracteres`);
        if (t.abilities !== undefined && !Array.isArray(t.abilities)) errors.push(`translations.${lang}.abilities debe ser una lista`);
        translations[lang] = t;
      }
      result.translations = translations;
    }
  }

  if (body.stats !== undefined) {
    if (body.stats !== null && !isPlainObject(body.stats)) {
      errors.push('stats debe ser un objeto o null');
    } else if (body.stats) {
      const { id: _id, card_id: _cardId, ...stats } = body.stats;
      checkNumericObject('stats', stats, errors);
      result.stats = stats;
    } else {
      result.stats = null;
    }
  }

  if (body.abilities !== undefined) {
    if (!Array.isArray(body.abilities) || body.abilities.some((ab) => !isPlainObject(ab))) {
      errors.push('abilities debe ser una lista de objetos');
    } else {
      result.abilities = body.abilities;
    }
  }

  if (mode === 'create') {
    const name = result.name ?? (result.translations as any)?.es?.name;
    if (!result.code) errors.push('code es obligatorio');
    if (!name) errors.push('name es obligatorio');
    if (!result.type) errors.push('type es obligatorio');
    if (!result.rarity) errors.push('rarity es obligatorio');
  }

  if (errors.length > 0) {
    throw new CardAdminError(400, 'Datos de carta no válidos', { errores: errors });
  }

  return result;
}
