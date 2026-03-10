/**
 * scripts/loadFromJson.ts
 *
 * Carga (upsert) todas las cartas de los archivos JSON de la carpeta `database/`
 * en la base de datos usando ON CONFLICT (code) DO UPDATE.
 *
 * Uso:
 *   npx ts-node scripts/loadFromJson.ts # loads all JSONs
 *   npx ts-node scripts/loadFromJson.ts --dry-run   # solo valida, no escribe
 *   npx ts-node scripts/loadFromJson.ts --file database/Santuario/Knights/bronze.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FILE_ARG = (() => {
  const idx = args.indexOf('--file');
  return idx !== -1 ? args[idx + 1] : null;
})();

// ---------------------------------------------------------------------------
// Types for the JSON schema
// ---------------------------------------------------------------------------
interface AbilityDef {
  name: string;
  type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
  description: string;
  ability_key?: string;
  /** Full AbilityDefinition JSONB (trigger, cost, conditions, actions) */
  effects: Record<string, unknown>;
  /** Conditions stored separately in card_abilities.conditions */
  conditions?: Record<string, unknown>;
}

interface CardStats {
  attack: number;
  defense: number;
  health: number;
  cosmos: number;
  can_defend?: boolean;
  defense_reduction?: number;
}

interface CardEntry {
  code: string;
  name: string;
  rarity: string;
  cost?: number;
  generate?: number;
  faction?: string;
  element?: string;
  image_url?: string;
  description?: string;
  stats?: CardStats;
  abilities?: AbilityDef[];
  // Allow unknown extra fields (silently skipped)
  [key: string]: unknown;
}

interface JsonFile {
  _schema?: number;
  saga?: string;
  type: string;
  rank?: string;
  cards: CardEntry[];
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toAbilityKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function stripMeta(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).filter(([k]) => !k.startsWith('_'))
  );
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------
let totalUpserted = 0;
let totalSkipped = 0;
let totalErrors = 0;

// ---------------------------------------------------------------------------
// Core upsert logic
// ---------------------------------------------------------------------------
async function upsertCard(
  card: CardEntry,
  fileType: string,
  fileRank: string | undefined
): Promise<void> {
  const t = await sequelize.transaction();
  try {
    // 1. Upsert cards row
    await sequelize.query(
      `INSERT INTO cards (
         id, code, name, type, rarity, cost, generate,
         description, image_url, faction, element,
         created_at, updated_at
       )
       VALUES (
         uuid_generate_v4(), :code, :name, :type, :rarity, :cost, :generate,
         :description, :image_url, :faction, :element,
         NOW(), NOW()
       )
       ON CONFLICT (code) DO UPDATE SET
         name        = EXCLUDED.name,
         type        = EXCLUDED.type,
         rarity      = EXCLUDED.rarity,
         cost        = EXCLUDED.cost,
         generate    = EXCLUDED.generate,
         description = EXCLUDED.description,
         image_url   = EXCLUDED.image_url,
         faction     = EXCLUDED.faction,
         element     = EXCLUDED.element,
         updated_at  = NOW()
       RETURNING id`,
      {
        replacements: {
          code:        card.code,
          name:        card.name,
          type:        fileType,
          rarity:      card.rarity,
          cost:        card.cost ?? 0,
          generate:    card.generate ?? 0,
          description: card.description ?? null,
          image_url:   card.image_url ?? null,
          faction:     card.faction ?? null,
          element:     card.element ?? null,
        },
        type: QueryTypes.SELECT,
        transaction: t,
      }
    );

    // Fetch the canonical id (works for both INSERT and UPDATE paths)
    const [row] = await sequelize.query<{ id: string }>(
      `SELECT id FROM cards WHERE code = :code`,
      { replacements: { code: card.code }, type: QueryTypes.SELECT, transaction: t }
    );
    const cardId = row.id;

    // 2. Upsert card_knights (if stats present)
    if (card.stats) {
      const s = card.stats;
      await sequelize.query(
        `INSERT INTO card_knights (
           card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank
         )
         VALUES (
           :card_id, :attack, :defense, :health, :cosmos, :can_defend, :defense_reduction, :rank
         )
         ON CONFLICT (card_id) DO UPDATE SET
           attack            = EXCLUDED.attack,
           defense           = EXCLUDED.defense,
           health            = EXCLUDED.health,
           cosmos            = EXCLUDED.cosmos,
           can_defend        = EXCLUDED.can_defend,
           defense_reduction = EXCLUDED.defense_reduction,
           rank              = EXCLUDED.rank`,
        {
          replacements: {
            card_id:          cardId,
            attack:           s.attack,
            defense:          s.defense,
            health:           s.health,
            cosmos:           s.cosmos,
            can_defend:       s.can_defend ?? true,
            defense_reduction: s.defense_reduction ?? 0.5,
            rank:             fileRank ?? null,
          },
          type: QueryTypes.INSERT,
          transaction: t,
        }
      );
    }

    // 3. Replace card_abilities (delete + insert — abilities don't have stable PKs)
    if (card.abilities && card.abilities.length > 0) {
      await sequelize.query(
        `DELETE FROM card_abilities WHERE card_id = :card_id`,
        { replacements: { card_id: cardId }, type: QueryTypes.DELETE, transaction: t }
      );

      for (const ability of card.abilities) {
        const abilityKey = ability.ability_key ?? toAbilityKey(ability.name);
        const effectsClean = stripMeta(ability.effects as Record<string, unknown>);
        const conditionsClean = ability.conditions
          ? stripMeta(ability.conditions as Record<string, unknown>)
          : {};

        await sequelize.query(
          `INSERT INTO card_abilities (
             id, card_id, name, ability_key, type, description, conditions, effects, created_at
           )
           VALUES (
             uuid_generate_v4(), :card_id, :name, :ability_key, :type,
             :description, :conditions::jsonb, :effects::jsonb, NOW()
           )`,
          {
            replacements: {
              card_id:     cardId,
              name:        ability.name,
              ability_key: abilityKey,
              type:        ability.type,
              description: ability.description,
              conditions:  JSON.stringify(conditionsClean),
              effects:     JSON.stringify(effectsClean),
            },
            type: QueryTypes.INSERT,
            transaction: t,
          }
        );
      }
    }

    await t.commit();
    totalUpserted++;
    console.log(`  ✔ ${card.code} (${card.name})`);
  } catch (err) {
    await t.rollback();
    totalErrors++;
    console.error(`  ✘ ${card.code} — ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Process one JSON file
// ---------------------------------------------------------------------------
async function processFile(filePath: string): Promise<void> {
  console.log(`\n[${path.relative(process.cwd(), filePath)}]`);

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    console.error(`  No se pudo leer el archivo`);
    totalErrors++;
    return;
  }

  if (!raw) {
    console.log(`  (vacío, omitido)`);
    totalSkipped++;
    return;
  }

  let data: JsonFile;
  try {
    data = JSON.parse(raw) as JsonFile;
  } catch (err) {
    console.error(`  JSON inválido — ${(err as Error).message}`);
    totalErrors++;
    return;
  }

  if (!Array.isArray(data.cards) || data.cards.length === 0) {
    console.log(`  (sin cartas, omitido)`);
    totalSkipped++;
    return;
  }

  const fileType = data.type;
  const fileRank = data.rank;

  for (const card of data.cards) {
    if (!card.code || !card.name) {
      console.warn(`  ⚠ Carta sin code/name, omitida`);
      totalSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [dry-run] ${card.code} (${card.name})`);
      totalSkipped++;
    } else {
      await upsertCard(card, fileType, fileRank);
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  if (DRY_RUN) {
    console.log('Modo DRY-RUN activo — sin escrituras en DB\n');
  }

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
    files = await glob(`${dbDir}/**/*.json`);
    files.sort();
  }

  if (files.length === 0) {
    console.error('No se encontraron archivos JSON.');
    process.exit(1);
  }

  try {
    await sequelize.authenticate();
    console.log('Conexión a DB establecida.');
  } catch (err) {
    console.error('No se pudo conectar a la DB:', (err as Error).message);
    process.exit(1);
  }

  for (const file of files) {
    await processFile(file);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Resultado:`);
  console.log(`  ✔ Upserted : ${totalUpserted}`);
  console.log(`  ○ Skipped  : ${totalSkipped}`);
  console.log(`  ✘ Errors   : ${totalErrors}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  await sequelize.close();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
