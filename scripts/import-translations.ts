/**
 * scripts/import-translations.ts
 *
 * Importa traducciones desde el JSON generado por export-translations.ts
 * y actualiza los archivos JSON de cartas (o la DB directamente).
 *
 * Uso:
 *   npx ts-node scripts/import-translations.ts --file translations_es_to_en.json
 *   npx ts-node scripts/import-translations.ts --file translations_es_to_en.json --dry-run
 *   npx ts-node scripts/import-translations.ts --file translations_es_to_en.json --target db
 *
 * Modos:
 *   --target json  (default) Actualiza los archivos JSON en database/
 *   --target db              Actualiza directamente la base de datos (requiere DB activa)
 *   --dry-run                Solo muestra qué cambiaría, sin escribir nada
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

const DRY_RUN    = args.includes('--dry-run');
const FILE_ARG   = getArg('--file', '');
const TARGET     = getArg('--target', 'json') as 'json' | 'db';

if (!FILE_ARG) {
  console.error('Error: Se requiere --file <ruta>');
  console.error('Ejemplo: npx ts-node scripts/import-translations.ts --file translations_es_to_en.json');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Types
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

interface TranslationFile {
  _source: string;
  _target: string;
  _total_cards?: number;
  cards: Record<string, CardTranslation>;
}

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

function toKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Convierte un campo a objeto i18n, preservando lo que ya hay.
 * Si el campo es string simple, lo asigna como idioma fuente.
 */
function toI18nField(
  existing: string | Record<string, string> | undefined,
  sourceLang: string,
  targetLang: string,
  newValue: string
): Record<string, string> {
  let base: Record<string, string> = {};

  if (typeof existing === 'string') {
    base[sourceLang] = existing;
  } else if (existing && typeof existing === 'object') {
    base = { ...existing };
  }

  if (newValue) {
    base[targetLang] = newValue;
  }

  return base;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------
let totalUpdated = 0;
let totalSkipped = 0;
let totalErrors  = 0;

// ---------------------------------------------------------------------------
// Update a single JSON file
// ---------------------------------------------------------------------------
function updateJsonFile(
  filePath: string,
  translations: Record<string, CardTranslation>,
  sourceLang: string,
  targetLang: string
): void {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return;

  let data: JsonFile;
  try {
    data = JSON.parse(raw) as JsonFile;
  } catch {
    console.error(`  ✘ JSON inválido: ${filePath}`);
    totalErrors++;
    return;
  }

  if (!Array.isArray(data.cards) || data.cards.length === 0) return;

  let fileModified = false;

  for (const card of data.cards) {
    if (!card.code || !translations[card.code]) continue;

    const t = translations[card.code];
    let cardModified = false;

    // Update card name
    if (t.name) {
      const updated = toI18nField(card.name, sourceLang, targetLang, t.name);
      if (JSON.stringify(card.name) !== JSON.stringify(updated)) {
        card.name = updated;
        cardModified = true;
      }
    }

    // Update card description
    if (t.description) {
      const updated = toI18nField(card.description, sourceLang, targetLang, t.description);
      if (JSON.stringify(card.description) !== JSON.stringify(updated)) {
        card.description = updated;
        cardModified = true;
      }
    }

    // Update abilities
    if (t.abilities && card.abilities) {
      // Build lookup: ability key → translated ability
      const translationByKey: Record<string, AbilityTranslation> = {};
      for (const ab of t.abilities) {
        if (ab.key) translationByKey[ab.key] = ab;
      }

      for (const ability of card.abilities) {
        const abilityKey = (ability.ability_key as string) ?? toKey(
          typeof ability.name === 'string' ? ability.name : Object.values(ability.name)[0] ?? ''
        );
        const abTranslation = translationByKey[abilityKey];
        if (!abTranslation) continue;

        if (abTranslation.name) {
          const updated = toI18nField(ability.name, sourceLang, targetLang, abTranslation.name);
          if (JSON.stringify(ability.name) !== JSON.stringify(updated)) {
            ability.name = updated;
            cardModified = true;
          }
        }

        if (abTranslation.description) {
          const updated = toI18nField(ability.description, sourceLang, targetLang, abTranslation.description);
          if (JSON.stringify(ability.description) !== JSON.stringify(updated)) {
            ability.description = updated;
            cardModified = true;
          }
        }
      }
    }

    if (cardModified) {
      const action = DRY_RUN ? '[dry-run]' : '✔';
      console.log(`    ${action} ${card.code}`);
      totalUpdated++;
      fileModified = true;
    } else {
      totalSkipped++;
    }
  }

  if (fileModified && !DRY_RUN) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }
}

// ---------------------------------------------------------------------------
// Update DB directly — writes to card_translations table
// ---------------------------------------------------------------------------
async function updateDatabase(
  translations: Record<string, CardTranslation>,
  sourceLang: string,
  targetLang: string
): Promise<void> {
  // Dynamic import to avoid requiring DB connection when using --target json
  const { sequelize } = await import('../src/config/database');
  const { QueryTypes } = await import('sequelize');

  try {
    await sequelize.authenticate();
    console.log('Conexión a DB establecida.\n');
  } catch (err) {
    console.error('No se pudo conectar a la DB:', (err as Error).message);
    process.exit(1);
  }

  for (const [code, t] of Object.entries(translations)) {
    try {
      // 1. Get card id
      const [existing] = await sequelize.query<{ id: string }>(
        `SELECT id FROM cards WHERE code = :code`,
        { replacements: { code }, type: QueryTypes.SELECT }
      );

      if (!existing) {
        console.log(`  ? ${code} — no encontrado en DB, omitido`);
        totalSkipped++;
        continue;
      }

      const cardId = existing.id;

      // 2. Build ability_translations JSONB: { ability_uuid: { name, description } }
      //    Look up each ability by ability_key to get its UUID.
      let abilityTranslationsJson = '{}';

      if (t.abilities && t.abilities.length > 0) {
        const dbAbilities = await sequelize.query<{ id: string; ability_key: string }>(
          `SELECT id, ability_key FROM card_abilities WHERE card_id = :card_id`,
          { replacements: { card_id: cardId }, type: QueryTypes.SELECT }
        );

        const translationByKey: Record<string, AbilityTranslation> = {};
        for (const ab of t.abilities) {
          if (ab.key) translationByKey[ab.key] = ab;
        }

        const abilityTranslations: Record<string, { name: string; description: string }> = {};
        for (const dbAb of dbAbilities) {
          const abT = translationByKey[dbAb.ability_key];
          if (abT) {
            abilityTranslations[dbAb.id] = {
              name:        abT.name        ?? '',
              description: abT.description ?? '',
            };
          }
        }
        abilityTranslationsJson = JSON.stringify(abilityTranslations);
      }

      // 3. Upsert row in card_translations
      if (!DRY_RUN) {
        await sequelize.query(
          `INSERT INTO card_translations
             (id, card_id, language, name, description, ability_translations, created_at, updated_at)
           VALUES
             (uuid_generate_v4(), :card_id, :language, :name, :description,
              :ability_translations::jsonb, NOW(), NOW())
           ON CONFLICT (card_id, language) DO UPDATE SET
             name                 = EXCLUDED.name,
             description          = EXCLUDED.description,
             ability_translations = EXCLUDED.ability_translations,
             updated_at           = NOW()`,
          {
            replacements: {
              card_id:              cardId,
              language:             targetLang,
              name:                 t.name,
              description:          t.description ?? null,
              ability_translations: abilityTranslationsJson,
            },
            type: QueryTypes.INSERT,
          }
        );
      }

      const action = DRY_RUN ? '[dry-run]' : '✔';
      console.log(`  ${action} ${code} — ${t.name}`);
      totalUpdated++;
    } catch (err) {
      console.error(`  ✘ ${code} — ${(err as Error).message}`);
      totalErrors++;
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const filePath = path.resolve(FILE_ARG);

  if (!fs.existsSync(filePath)) {
    console.error(`Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }

  let translationFile: TranslationFile;
  try {
    translationFile = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TranslationFile;
  } catch (err) {
    console.error(`JSON inválido en ${FILE_ARG}: ${(err as Error).message}`);
    process.exit(1);
  }

  if (!translationFile.cards || !translationFile._source || !translationFile._target) {
    console.error('El archivo no tiene el formato correcto (requiere: _source, _target, cards)');
    process.exit(1);
  }

  const { _source: sourceLang, _target: targetLang, cards: translations } = translationFile;
  const cardCount = Object.keys(translations).length;

  console.log(`Importando traducciones [${sourceLang} → ${targetLang}]`);
  console.log(`  Archivo: ${FILE_ARG}`);
  console.log(`  Cartas en archivo: ${cardCount}`);
  console.log(`  Destino: ${TARGET === 'db' ? 'Base de datos' : 'Archivos JSON'}`);
  if (DRY_RUN) console.log('  Modo: DRY-RUN (sin cambios reales)');
  console.log('');

  if (TARGET === 'db') {
    await updateDatabase(translations, sourceLang, targetLang);
  } else {
    // JSON mode: encontrar los archivos que tienen estas cartas
    const dbDir = path.resolve(__dirname, '..', 'database');
    const files = (await glob(`${dbDir}/**/*.json`)).sort();

    let filesProcessed = 0;
    for (const f of files) {
      const raw = fs.readFileSync(f, 'utf-8').trim();
      if (!raw) continue;

      let data: JsonFile;
      try { data = JSON.parse(raw) as JsonFile; } catch { continue; }
      if (!Array.isArray(data.cards) || data.cards.length === 0) continue;

      // ¿Este archivo tiene alguna carta que esté en las traducciones?
      const hasMatch = data.cards.some((c) => c.code && translations[c.code]);
      if (!hasMatch) continue;

      const rel = path.relative(process.cwd(), f).replace(/\\/g, '/');
      console.log(`  [${rel}]`);
      updateJsonFile(f, translations, sourceLang, targetLang);
      filesProcessed++;
    }

    if (filesProcessed === 0) {
      console.log('  No se encontraron cartas coincidentes en los archivos JSON.');
    }
  }

  console.log('');
  console.log('─'.repeat(50));
  console.log(`  Actualizadas: ${totalUpdated}`);
  console.log(`  Sin cambios:  ${totalSkipped}`);
  if (totalErrors > 0) console.log(`  Errores:      ${totalErrors}`);
  if (DRY_RUN) console.log('\n  (dry-run: ningún archivo fue modificado)');
  else if (TARGET === 'json') {
    console.log('\nPróximo paso: ejecutar loadFromJson para reflejar los cambios en la DB:');
    console.log('  npx ts-node scripts/loadFromJson.ts');
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
