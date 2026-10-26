import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/database';
import { Transaction } from 'sequelize';
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
  set?: string;
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

const ELEMENT_MAP: Record<string, 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null> = {
  steel: 'steel',
  fire: 'fire',
  water: 'water',
  earth: 'earth',
  wind: 'wind',
  light: 'light',
  dark: 'dark',
  divine: 'light',
};

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function getName(input?: JsonText): string {
  return (input?.en || input?.es || input?.pt || '').trim();
}

function getDescription(input?: JsonText): string {
  return (input?.es || input?.en || input?.pt || '').trim();
}

function normalizeElement(raw: string | undefined): 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null {
  if (!raw) return null;
  return ELEMENT_MAP[raw.toLowerCase()] ?? null;
}

async function generateUniqueCode(baseName: string, tx: Transaction, reservedCodes: Set<string>): Promise<string> {
  const base = slugify(baseName) || 'legendary_card';
  let candidate = base;
  let index = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (reservedCodes.has(candidate)) {
      candidate = `${base}_${index}`;
      index += 1;
      continue;
    }

    const exists = await Card.findOne({ where: { code: candidate }, transaction: tx });
    if (!exists) {
      reservedCodes.add(candidate);
      return candidate;
    }

    candidate = `${base}_${index}`;
    index += 1;
  }
}

function resolveAbility(raw: AbilityInput | string, defaults: TemplateDefaults): AbilityInput | null {
  if (typeof raw === 'string') {
    if (!raw.startsWith('@')) return null;
    const key = raw.slice(1);
    const common = defaults.common_abilities?.[key];
    if (!common) return null;
    return { ...common, name: common.name || key };
  }
  return raw;
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

function collectUnsupportedEffects(cards: CardInput[], defaults: TemplateDefaults): string[] {
  const rows: string[] = [];

  for (const card of cards) {
    const cardName = getName(card.names) || 'Carta sin nombre';
    for (const raw of card.abilities || []) {
      const resolved = resolveAbility(raw, defaults);
      if (!resolved) continue;
      const abilityName = resolved.names?.es || resolved.name || 'Habilidad sin nombre';
      const effects = Array.isArray(resolved.effects)
        ? resolved.effects
        : resolved.effects
          ? [resolved.effects]
          : [];

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

function writeTodo(filePath: string, rows: string[]): void {
  const lines = [
    '# TODO Legendary abilities',
    '',
    'Este archivo lista efectos detectados en src/assets/legendary/cards.json que aun no existen en el motor declarativo actual.',
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

  fs.writeFileSync(filePath, lines.join('\n'));
}

async function run(): Promise<void> {
  const basePath = path.join(__dirname, '../assets/legendary');
  const cardsPath = path.join(basePath, 'cards.json');
  const templatePath = path.join(basePath, 'template.json');
  const todoPath = path.join(__dirname, '../../docs/TODO-LEGENDARY-ABILITIES.md');

  if (!fs.existsSync(cardsPath)) {
    throw new Error(`No existe archivo: ${cardsPath}`);
  }

  const cardsFile = JSON.parse(fs.readFileSync(cardsPath, 'utf-8')) as CardsFile;
  const defaults = fs.existsSync(templatePath)
    ? (JSON.parse(fs.readFileSync(templatePath, 'utf-8'))?.defaults as TemplateDefaults)
    : {};

  const cards = cardsFile.cards || [];
  if (cards.length === 0) {
    console.log('No hay cartas para importar.');
    return;
  }

  console.log(`Cartas encontradas en legendary/cards.json: ${cards.length}`);

  await sequelize.authenticate();
  const tx = await sequelize.transaction();

  let created = 0;
  let skipped = 0;
  let abilitiesCreated = 0;
  const reservedCodes = new Set<string>();

  try {
    for (const cardData of cards) {
      const name = getName(cardData.names) || 'Legendary Card';
      const description = getDescription(cardData.descriptions) || null;
      const imageUrl = cardData.image_url || null;
      const rarityRaw = (cardData.rarity || defaults.rarity || 'divine').toLowerCase();
      const rarity = RARITY_MAP[rarityRaw] || 'divine';
      const element = normalizeElement(defaults.element);

      const existing = imageUrl
        ? await Card.findOne({ where: { image_url: imageUrl }, transaction: tx })
        : null;

      if (existing) {
        skipped += 1;
        console.log(`SKIP ${name} (ya existe)`);
        continue;
      }

      const code = await generateUniqueCode(name, tx, reservedCodes);

      const card = await Card.create(
        {
          code,
          name,
          type: 'knight',
          rarity,
          cost: cardData.cost ?? defaults.cost ?? 0,
          generate: cardData.generate ?? defaults.generate ?? 0,
          description,
          image_url: imageUrl,
          faction: defaults.faction || null,
          element,
          max_copies: defaults.max_copies ?? 1,
          unique: cardData.unique ?? defaults.unique ?? true,
          playable_zones: defaults.playable_zones ?? ['battlefield'],
          collection_id: defaults.collection_id ?? null,
          artist: null,
          language: defaults.language ?? 'es',
          balance_notes: defaults.balance_notes ?? null,
          power_level: defaults.power_level ?? null,
          tags: cardData.tags || defaults.tags || ['legendary'],
          card_set: defaults.set ?? 'LegendarySeries',
          release_year: null,
          notes: null,
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
          rank: null,
        },
        { transaction: tx }
      );

      for (const rawAbility of cardData.abilities || []) {
        const resolved = resolveAbility(rawAbility, defaults);
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

    const unsupportedRows = collectUnsupportedEffects(cards, defaults);
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
  console.error('Error importando cartas legendary:', error);
  process.exit(1);
});
