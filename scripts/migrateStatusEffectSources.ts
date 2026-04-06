/**
 * Normaliza status_effects.source en cards_in_play.
 *
 * Legacy:
 *   { source: "<card_instance_id>" }
 *
 * Nuevo:
 *   { source: { card_instance_id: "<card_instance_id>" } }
 *
 * Uso:
 *   ts-node scripts/migrateStatusEffectSources.ts
 *   ts-node scripts/migrateStatusEffectSources.ts --dry-run
 */

import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';

type SourceObject = {
  card_instance_id: string;
  player?: 1 | 2;
  type?: 'knight' | 'technique' | 'scenario' | 'passive';
};

type StatusEffectLike = {
  type?: string;
  source?: unknown;
  [key: string]: unknown;
};

function normalizeSource(source: unknown): SourceObject | undefined {
  if (!source) return undefined;

  if (typeof source === 'string') {
    return { card_instance_id: source };
  }

  if (typeof source === 'object') {
    const s = source as Record<string, unknown>;
    const fromCardInstance = s.card_instance_id;
    const fromLegacyCardId = s.source_card_id;
    const cardInstanceId =
      (typeof fromCardInstance === 'string' && fromCardInstance) ||
      (typeof fromLegacyCardId === 'string' && fromLegacyCardId) ||
      null;

    if (!cardInstanceId) return undefined;

    const normalized: SourceObject = { card_instance_id: cardInstanceId };
    if (s.player === 1 || s.player === 2) normalized.player = s.player;
    if (
      s.type === 'knight' ||
      s.type === 'technique' ||
      s.type === 'scenario' ||
      s.type === 'passive'
    ) {
      normalized.type = s.type;
    }
    return normalized;
  }

  return undefined;
}

function normalizeEffects(raw: string): { normalized: string; changed: boolean } {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return { normalized: raw, changed: false };

  let changed = false;
  const next = parsed.map((effect: StatusEffectLike) => {
    if (!effect || typeof effect !== 'object') return effect;

    const normalizedSource = normalizeSource(effect.source);
    if (JSON.stringify(effect.source) !== JSON.stringify(normalizedSource)) {
      changed = true;
    }

    return {
      ...effect,
      ...(normalizedSource ? { source: normalizedSource } : {}),
      ...(!normalizedSource && effect.source !== undefined ? { source: undefined } : {}),
    };
  });

  return { normalized: JSON.stringify(next), changed };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a DB OK');

    const rows = await sequelize.query<{ id: string; status_effects: string }>(
      `
      SELECT id, status_effects
      FROM cards_in_play
      WHERE status_effects IS NOT NULL
        AND status_effects <> '[]'
      `,
      { type: QueryTypes.SELECT },
    );

    let scanned = 0;
    let changedRows = 0;
    let invalidRows = 0;

    await sequelize.transaction(async (tx) => {
      for (const row of rows) {
        scanned += 1;

        try {
          const { normalized, changed } = normalizeEffects(row.status_effects);
          if (!changed) continue;

          changedRows += 1;

          if (!dryRun) {
            await sequelize.query(
              `UPDATE cards_in_play SET status_effects = :status_effects WHERE id = :id`,
              {
                replacements: {
                  id: row.id,
                  status_effects: normalized,
                },
                transaction: tx,
              },
            );
          }
        } catch {
          invalidRows += 1;
        }
      }

      if (dryRun) {
        // Evitar escritura accidental en modo simulación.
        throw new Error('__DRY_RUN_ROLLBACK__');
      }
    }).catch((err: Error) => {
      if (err.message !== '__DRY_RUN_ROLLBACK__') throw err;
    });

    console.log(`📊 Filas escaneadas: ${scanned}`);
    console.log(`🔧 Filas a normalizar: ${changedRows}`);
    if (invalidRows > 0) console.log(`⚠️ Filas con JSON inválido: ${invalidRows}`);
    console.log(dryRun ? '🧪 Dry-run completado (sin cambios persistidos).' : '✅ Migración completada.');
  } catch (error: any) {
    console.error('❌ Error en migración:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
