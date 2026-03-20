/**
 * scripts/export-translations.ts
 *
 * Exporta todos los textos traducibles de los JSON de cartas a un archivo
 * compacto listo para pasarle a una IA (o traductor).
 *
 * Uso:
 *   npx ts-node scripts/export-translations.ts
 *   npx ts-node scripts/export-translations.ts --source es --target en
 *   npx ts-node scripts/export-translations.ts --target pt --out translations_pt.json
 *   npx ts-node scripts/export-translations.ts --file database/Santuario/Knights/bronze.json
 *
 * El JSON resultante SOLO contiene textos (name, description).
 * No incluye stats, effects, ni mecánicas. Es seguro pasárselo a una IA
 * sin revelar la lógica interna del juego.
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const SOURCE_LANG = getArg('--source', 'es');
const TARGET_LANG = getArg('--target', 'en');
const OUT_FILE    = getArg('--out', `translations_${SOURCE_LANG}_to_${TARGET_LANG}.json`);
const FILE_ARG    = getArg('--file', '');

// ---------------------------------------------------------------------------
// Types (subset del esquema de los JSON de cartas)
// ---------------------------------------------------------------------------
interface AbilityDef {
  name: string | Record<string, string>;
  type: string;
  description?: string | Record<string, string>;
  ability_key?: string;
  effects?: unknown;
  [key: string]: unknown;
}

interface CardEntry {
  code: string;
  name: string | Record<string, string>;
  description?: string | Record<string, string>;
  abilities?: AbilityDef[];
  [key: string]: unknown;
}

interface JsonFile {
  saga?: string;
  type?: string;
  rank?: string;
  cards: CardEntry[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extrae el texto en el idioma fuente del campo (string simple o i18n object) */
function getText(field: string | Record<string, string> | undefined, lang: string): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  // Objeto i18n: devuelve el idioma pedido, o el primero disponible como fallback
  return field[lang] ?? field['es'] ?? Object.values(field)[0] ?? '';
}

/** Genera una clave estable para la habilidad */
function toKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// ---------------------------------------------------------------------------
// Build translation map
// ---------------------------------------------------------------------------

interface AbilityTranslation {
  key: string;
  name: string;
  description: string;
}

interface CardTranslation {
  name: string;
  description: string;
  abilities: AbilityTranslation[];
  _source_file?: string;
}

interface TranslationExport {
  _instructions: string;
  _source: string;
  _target: string;
  _generated_at: string;
  _total_cards: number;
  cards: Record<string, CardTranslation>;
}

function extractFromFile(filePath: string, source: string): Record<string, CardTranslation> {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return {};

  let data: JsonFile;
  try {
    data = JSON.parse(raw) as JsonFile;
  } catch (err) {
    console.error(`  ✘ JSON inválido en ${filePath}: ${(err as Error).message}`);
    return {};
  }

  if (!Array.isArray(data.cards) || data.cards.length === 0) return {};

  const result: Record<string, CardTranslation> = {};
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  for (const card of data.cards) {
    if (!card.code) continue;

    const abilities: AbilityTranslation[] = (card.abilities ?? []).map((ab) => ({
      key: ab.ability_key ?? toKey(getText(ab.name, source)),
      name: getText(ab.name, source),
      description: getText(ab.description, source),
    }));

    result[card.code] = {
      name: getText(card.name, source),
      description: getText(card.description, source),
      abilities,
      _source_file: relPath,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  let files: string[];

  if (FILE_ARG) {
    const abs = path.resolve(FILE_ARG);
    if (!fs.existsSync(abs)) {
      console.error(`Archivo no encontrado: ${abs}`);
      process.exit(1);
    }
    files = [abs];
  } else {
    const dbDir = path.resolve(__dirname, '..', 'database');
    files = (await glob(`${dbDir}/**/*.json`)).sort();
  }

  if (files.length === 0) {
    console.error('No se encontraron archivos JSON.');
    process.exit(1);
  }

  console.log(`Exportando textos [${SOURCE_LANG} → ${TARGET_LANG}] desde ${files.length} archivo(s)...\n`);

  const allCards: Record<string, CardTranslation> = {};

  for (const f of files) {
    const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
    const extracted = extractFromFile(f, SOURCE_LANG);
    const count = Object.keys(extracted).length;
    if (count > 0) {
      Object.assign(allCards, extracted);
      console.log(`  ✔ ${rel} — ${count} carta(s)`);
    } else {
      console.log(`  - ${rel} — vacío, omitido`);
    }
  }

  const totalCards = Object.keys(allCards).length;

  const output: TranslationExport = {
    _instructions: [
      `Translate all "name" and "description" values from ${SOURCE_LANG.toUpperCase()} to ${TARGET_LANG.toUpperCase()}.`,
      `Do NOT modify keys, codes, or the "_source_file" fields.`,
      `Keep card names faithful to the Saint Seiya universe when translating.`,
      `Ability descriptions may reference game mechanics (BA=Basic Attack, CP=Cosmos Points, AR=Armor Rating, DIP=Direct Damage). Keep those abbreviations as-is.`,
      `Return the complete JSON with the same structure, only replacing the text values.`,
    ].join(' '),
    _source: SOURCE_LANG,
    _target: TARGET_LANG,
    _generated_at: new Date().toISOString(),
    _total_cards: totalCards,
    cards: allCards,
  };

  const outPath = path.resolve(OUT_FILE);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\n✅ Exportado: ${outPath}`);
  console.log(`   ${totalCards} cartas  |  ${TARGET_LANG.toUpperCase()} destino`);
  console.log(`\nPróximo paso:`);
  console.log(`  1. Pasale ${OUT_FILE} a una IA para que traduzca los textos`);
  console.log(`  2. Importa el resultado con:`);
  console.log(`     npx ts-node scripts/import-translations.ts --file ${OUT_FILE}`);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
