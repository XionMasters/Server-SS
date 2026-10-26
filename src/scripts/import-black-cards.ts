import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';

type JsonText = {
  es?: string;
  en?: string;
  pt?: string;
  [key: string]: string | undefined;
};

type AbilityInput = {
  name?: string;
  names?: JsonText;
  type?: string;
  description?: string;
  descriptions?: JsonText;
  conditions?: any;
  effects?: any;
};

type CardInput = {
  names?: JsonText;
  rarity?: string;
  armor_class?: string;
  cost?: number;
  generate?: number;
  descriptions?: JsonText;
  image_url?: string;
  knight_stats?: {
    attack?: number;
    defense?: number;
    health?: number;
    cosmos?: number;
  };
  abilities?: Array<AbilityInput | string>;
  unique?: boolean;
  tags?: string[];
};

type TemplateDefaults = {
  type?: string;
  faction?: string;
  element?: string;
  rarity?: string;
  cost?: number;
  generate?: number;
  armor_class?: string;
  artist?: string;
  set?: string;
  release_year?: number;
  notes?: string;
  max_copies?: number;
  unique?: boolean;
  playable_zones?: string[];
  collection_id?: string | null;
  language?: string;
  balance_notes?: string;
  power_level?: number | null;
  tags?: string[];
  common_abilities?: Record<string, AbilityInput>;
};

type CardsFile = {
  template?: string;
  cards: CardInput[];
};

type DataFileCard = {
  card_name?: string | JsonText;
  abilities?: AbilityInput[];
};

const SUPPORTED_ACTIONS = new Set<string>([
  'apply_status',
  'apply_damage',
  'apply_player_damage',
  'apply_cosmos_damage',
  'kill',
  'heal',
  'summon_from_zone',
  'coin_flip_then',
  'request_selection',
  'send_to_zone',
  'shuffle_deck',
  'draw_card',
]);

const RARITY_MAP: Record<string, 'common' | 'rare' | 'epic' | 'legendary' | 'divine'> = {
  comun: 'common',
  common: 'common',
  rara: 'rare',
  rare: 'rare',
  epica: 'epic',
  epic: 'epic',
  legendaria: 'legendary',
  legendary: 'legendary',
  divina: 'divine',
  divine: 'divine',
};

const ABILITY_TYPE_MAP: Record<string, 'activa' | 'pasiva' | 'equipamiento' | 'campo'> = {
  activa: 'activa',
  active: 'activa',
  pasiva: 'pasiva',
  passive: 'pasiva',
  equipamiento: 'equipamiento',
  equipment: 'equipamiento',
  campo: 'campo',
  field: 'campo',
  trigger: 'pasiva',
};

function getDisplayName(input?: JsonText): string {
  return (input?.en || input?.es || input?.pt || '').trim();
}

function getDescription(input?: JsonText): string {
  return (input?.es || input?.en || input?.pt || '').trim();
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

async function generateUniqueCode(baseName: string): Promise<string> {
  const base = slugify(baseName) || 'black_card';
  let candidate = base;
  let index = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await Card.findOne({ where: { code: candidate } });
    if (!existing) return candidate;
    candidate = `${base}_${index}`;
    index += 1;
  }
}

function resolveAbility(
  rawAbility: AbilityInput | string,
  defaults: TemplateDefaults
): AbilityInput | null {
  if (typeof rawAbility === 'string') {
    if (!rawAbility.startsWith('@')) return null;
    const ref = rawAbility.slice(1);
    const common = defaults.common_abilities?.[ref];
    if (!common) return null;
    return {
      ...common,
      name: common.name || ref,
    };
  }

  return rawAbility;
}

function normalizeAbility(ability: AbilityInput): {
  name: string;
  type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
  description: string;
  conditions: any;
  effects: any[];
} {
  const name = (ability.names?.es || ability.names?.en || ability.name || 'Habilidad sin nombre').trim();
  const typeRaw = (ability.type || 'activa').toLowerCase();
  const type = ABILITY_TYPE_MAP[typeRaw] || 'activa';
  const description = (ability.descriptions?.es || ability.descriptions?.en || ability.description || '').trim();
  const effects = Array.isArray(ability.effects)
    ? ability.effects
    : ability.effects
      ? [ability.effects]
      : [];

  return {
    name,
    type,
    description,
    conditions: ability.conditions || {},
    effects,
  };
}

function parseCardName(raw: string | JsonText | undefined): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  return getDisplayName(raw);
}

function collectUnsupportedEffectsFromData(dataFilePath: string): string[] {
  if (!fs.existsSync(dataFilePath)) return [];

  const parsed = JSON.parse(fs.readFileSync(dataFilePath, 'utf-8')) as DataFileCard[];
  const rows: string[] = [];

  for (const card of parsed) {
    const cardName = parseCardName(card.card_name) || 'Carta sin nombre';
    for (const ability of card.abilities || []) {
      const abilityName = ability.names?.es || ability.name || 'Habilidad sin nombre';
      const effects = Array.isArray(ability.effects) ? ability.effects : [];

      for (const effect of effects) {
        const effectType = effect?.type;
        if (!effectType) continue;
        if (!SUPPORTED_ACTIONS.has(effectType)) {
          rows.push(`- ${cardName} :: ${abilityName} -> ${effectType}`);
        }
      }
    }
  }

  return Array.from(new Set(rows)).sort();
}

function writeTodo(todoPath: string, rows: string[]): void {
  const lines: string[] = [
    '# TODO Black abilities',
    '',
    'Este archivo lista efectos detectados en src/assets/black/data.json que aun no existen en el motor declarativo actual.',
    '',
    'Acciones soportadas hoy: apply_status, apply_damage, apply_player_damage, apply_cosmos_damage, kill, heal, summon_from_zone, coin_flip_then, request_selection, send_to_zone, shuffle_deck, draw_card.',
    '',
  ];

  if (rows.length === 0) {
    lines.push('- No se detectaron efectos pendientes.');
  } else {
    lines.push('## Efectos pendientes por implementar');
    lines.push('');
    lines.push(...rows);
  }

  lines.push('');
  lines.push('## Nota');
  lines.push('Estas cartas si se importan en base de datos. El TODO solo afecta su ejecucion de habilidades en runtime.');
  lines.push('');

  fs.writeFileSync(todoPath, lines.join('\n'));
}

async function run(): Promise<void> {
  const basePath = path.join(__dirname, '../assets/black');
  const cardsPath = path.join(basePath, 'cards.json');
  const templatePath = path.join(basePath, 'template.json');
  const dataPath = path.join(basePath, 'data.json');
  const todoPath = path.join(__dirname, '../../docs/TODO-BLACK-ABILITIES.md');

  if (!fs.existsSync(cardsPath)) {
    throw new Error(`No existe archivo de cartas: ${cardsPath}`);
  }

  const cardsFile = JSON.parse(fs.readFileSync(cardsPath, 'utf-8')) as CardsFile;
  const templateDefaults = fs.existsSync(templatePath)
    ? (JSON.parse(fs.readFileSync(templatePath, 'utf-8'))?.defaults as TemplateDefaults)
    : {};

  const cards = cardsFile.cards || [];
  if (cards.length === 0) {
    console.log('No hay cartas para importar en cards.json');
    return;
  }

  console.log(`Cartas encontradas en black/cards.json: ${cards.length}`);

  await sequelize.authenticate();
  const tx = await sequelize.transaction();

  let created = 0;
  let skipped = 0;
  let abilitiesCreated = 0;

  try {
    for (const cardData of cards) {
      const mergedRarity = (cardData.rarity || templateDefaults.rarity || 'common').toLowerCase();
      const rarity = RARITY_MAP[mergedRarity] || 'common';
      let name = getDisplayName(cardData.names || {}) || 'Black Card';
      const description = getDescription(cardData.descriptions || {}) || null;
      const imageUrl = cardData.image_url || null;

      // El JSON original trae Shadow_Phoenix con nombre "Black Phoenix".
      // Normalizamos para evitar colision con Black_Phoenix.webp.
      if (imageUrl?.toLowerCase().includes('shadow_phoenix') && name.toLowerCase() === 'black phoenix') {
        name = 'Shadow Phoenix';
      }

      const existing = imageUrl
        ? await Card.findOne({ where: { image_url: imageUrl }, transaction: tx })
        : null;

      if (existing) {
        skipped += 1;
        console.log(`SKIP ${name} (ya existe)`);
        continue;
      }

      const code = await generateUniqueCode(name.startsWith('Black') ? name : `black_${name}`);

      const card = await Card.create(
        {
          code,
          name,
          type: 'knight',
          rarity,
          cost: cardData.cost ?? templateDefaults.cost ?? 0,
          generate: cardData.generate ?? templateDefaults.generate ?? 0,
          description,
          image_url: imageUrl,
          faction: templateDefaults.faction || 'Black Saint',
          element: (templateDefaults.element as any) || 'dark',
          max_copies: templateDefaults.max_copies ?? 3,
          unique: cardData.unique ?? templateDefaults.unique ?? false,
          playable_zones: templateDefaults.playable_zones ?? ['battlefield'],
          collection_id: templateDefaults.collection_id ?? null,
          artist: templateDefaults.artist ?? null,
          language: templateDefaults.language ?? 'es',
          balance_notes: templateDefaults.balance_notes ?? null,
          power_level: templateDefaults.power_level ?? null,
          tags: cardData.tags || templateDefaults.tags || ['black-saint'],
          card_set: templateDefaults.set ?? 'BlackSaintSeries',
          release_year: templateDefaults.release_year ?? 2012,
          notes: templateDefaults.notes ?? null,
        },
        { transaction: tx }
      );

      await CardKnight.create(
        {
          card_id: card.id,
          attack: cardData.knight_stats?.attack ?? 1,
          defense: cardData.knight_stats?.defense ?? 1,
          health: cardData.knight_stats?.health ?? 1,
          cosmos: cardData.knight_stats?.cosmos ?? 0,
          can_defend: true,
          defense_reduction: 0.5,
          rank: 'Black Saint',
        },
        { transaction: tx }
      );

      const rawAbilities = cardData.abilities || [];
      for (const raw of rawAbilities) {
        const resolved = resolveAbility(raw, templateDefaults);
        if (!resolved) continue;

        const ability = normalizeAbility(resolved);
        await CardAbility.create(
          {
            card_id: card.id,
            name: ability.name,
            ability_key: slugify(ability.name),
            type: ability.type,
            description: ability.description || ability.name,
            conditions: ability.conditions,
            effects: ability.effects,
          },
          { transaction: tx }
        );

        abilitiesCreated += 1;
      }

      created += 1;
      console.log(`OK   ${name}`);
    }

    await tx.commit();

    const unsupportedRows = collectUnsupportedEffectsFromData(dataPath);
    writeTodo(todoPath, unsupportedRows);

    console.log('----------------------------------------');
    console.log(`Creadas: ${created}`);
    console.log(`Omitidas: ${skipped}`);
    console.log(`Habilidades creadas: ${abilitiesCreated}`);
    console.log(`TODO generado: ${todoPath}`);
    console.log('----------------------------------------');
  } catch (error) {
    if (!(tx as any).finished) {
      await tx.rollback();
    }
    throw error;
  } finally {
    await sequelize.close();
  }
}

run().catch((error) => {
  console.error('Error importando cartas black:', error);
  process.exit(1);
});
