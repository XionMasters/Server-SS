import fs from 'fs';
import path from 'path';
import { createWorker } from 'tesseract.js';

type Ability = {
  names: { es: string; en: string; pt: string };
  type: 'activa' | 'pasiva';
  cosmos_cost: number;
  descriptions: { es: string; en: string; pt: string };
  conditions: Record<string, unknown>;
  effects: Array<Record<string, unknown>>;
};

type CardEntry = {
  names: { es: string; en: string; pt: string };
  image_url: string;
  descriptions: { es: string; en: string; pt: string };
  rarity: string;
  cost: number;
  generate: number;
  knight_stats: {
    attack: number;
    defense: number;
    health: number;
    cosmos: number;
  };
  abilities: Ability[];
  tags: string[];
};

const ROOT = path.join(__dirname, '../assets/legendary');
const OUT_PATH = path.join(ROOT, 'cards.json');

const RANK_TO_RARITY: Record<string, 'common' | 'rare' | 'legendary' | 'divine'> = {
  bronze: 'common',
  silver: 'rare',
  gold: 'legendary',
  divine: 'divine',
  omega: 'divine',
};

const DEFAULT_STATS: Record<'common' | 'rare' | 'legendary' | 'divine', { attack: number; defense: number; health: number; cosmos: number }> = {
  common: { attack: 8, defense: 4, health: 9, cosmos: 10 },
  rare: { attack: 9, defense: 6, health: 10, cosmos: 10 },
  legendary: { attack: 10, defense: 8, health: 10, cosmos: 11 },
  divine: { attack: 12, defense: 10, health: 11, cosmos: 12 },
};

function sanitizeLine(line: string): string {
  return line
    .replace(/[_|\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectRank(text: string): 'bronze' | 'silver' | 'gold' | 'divine' | 'omega' {
  const lower = text.toLowerCase();
  if (lower.includes('omega saint')) return 'omega';
  if (lower.includes('divine saint')) return 'divine';
  if (lower.includes('gold saint')) return 'gold';
  if (lower.includes('silver saint')) return 'silver';
  return 'bronze';
}

function parseStat(text: string, labels: string[], fallback: number): number {
  for (const label of labels) {
    const rx = new RegExp(`${label}\\s*[:.]?\\s*(\\d{1,2})`, 'i');
    const m = text.match(rx);
    if (m?.[1]) return Number(m[1]);
  }
  return fallback;
}

function parseName(lines: string[], fileNum: number): string {
  const candidates = lines
    .map(sanitizeLine)
    .filter(Boolean)
    .filter((l) => !/saint|copyright|stcga|willytox|http|ce|ar|cp|lp/i.test(l))
    .filter((l) => /[a-z]/i.test(l));

  const raw = candidates[0] || `Legendary Card ${fileNum}`;
  const cleaned = raw
    .replace(/[^a-zA-Z0-9'\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || `Legendary Card ${fileNum}`;
}

function parseAbilities(lines: string[]): Ability[] {
  const abilityLines = lines
    .map(sanitizeLine)
    .filter((line) => line.includes(':'))
    .filter((line) => !/copyright|stcga|http/i.test(line));

  const picked = abilityLines.slice(0, 2);

  return picked.map((line, idx) => {
    const [nameRaw, ...descParts] = line.split(':');
    const name = sanitizeLine(nameRaw) || `Ability ${idx + 1}`;
    const desc = sanitizeLine(descParts.join(':')) || line;

    return {
      names: { es: name, en: name, pt: name },
      type: idx === 0 ? 'activa' : 'pasiva',
      cosmos_cost: 0,
      descriptions: {
        es: desc,
        en: desc,
        pt: desc,
      },
      conditions: {},
      effects: [],
    };
  });
}

async function run(): Promise<void> {
  const files = fs
    .readdirSync(ROOT)
    .filter((f) => /^\d+\.webp$/i.test(f))
    .sort((a, b) => Number(a.replace(/\.webp$/i, '')) - Number(b.replace(/\.webp$/i, '')));

  if (files.length === 0) {
    throw new Error('No se encontraron imagenes numericas en src/assets/legendary');
  }

  const worker = await createWorker('eng');
  const cards: CardEntry[] = [];

  try {
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      const absolute = path.join(ROOT, file);
      const fileNum = Number(file.replace(/\.webp$/i, ''));
      const imageUrl = `/assets/legendary/${file}`;

      const result = await worker.recognize(absolute);
      const rawText = result.data.text || '';
      const lines = rawText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const rank = detectRank(rawText);
      const rarity = RANK_TO_RARITY[rank];
      const baseStats = DEFAULT_STATS[rarity];

      const name = parseName(lines, fileNum);

      const attack = parseStat(rawText, ['Ar', 'AT', 'A7', 'A'], baseStats.attack);
      const defense = parseStat(rawText, ['Df', 'Def', 'DE'], baseStats.defense);
      const health = parseStat(rawText, ['Lp', 'LP', 'L'], baseStats.health);
      const cosmos = parseStat(rawText, ['Cp', 'CP', 'C'], baseStats.cosmos);

      const shortDescription = lines.slice(0, 6).map(sanitizeLine).join(' ').slice(0, 220) || 'Legendary card imported from image OCR.';
      const abilities = parseAbilities(lines);

      cards.push({
        names: { es: name, en: name, pt: name },
        image_url: imageUrl,
        descriptions: {
          es: shortDescription,
          en: shortDescription,
          pt: shortDescription,
        },
        rarity,
        cost: Math.max(2, Math.min(12, Math.round(cosmos / 2))),
        generate: Math.max(1, Math.min(6, Math.round(attack / 3))),
        knight_stats: {
          attack,
          defense,
          health,
          cosmos,
        },
        abilities,
        tags: ['legendary', rank],
      });

      if ((i + 1) % 10 === 0 || i + 1 === files.length) {
        // eslint-disable-next-line no-console
        console.log(`OCR ${i + 1}/${files.length}`);
      }
    }
  } finally {
    await worker.terminate();
  }

  const out = {
    template: 'LegendarySeries',
    cards,
  };

  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
  // eslint-disable-next-line no-console
  console.log(`cards.json generado con ${cards.length} cartas en ${OUT_PATH}`);
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Error generando cards.json por OCR:', error);
  process.exit(1);
});
