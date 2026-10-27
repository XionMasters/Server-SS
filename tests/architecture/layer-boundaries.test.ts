/**
 * Verifica las fronteras entre capas descritas en docs/REFACTORING-ROADMAP.md:
 *
 *   interfaces → app → domain
 *   infrastructure → app/domain
 *   domain: sin I/O (ni Sequelize, ni ws, ni Express, ni process.env)
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '../../src');

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.ts$/.test(entry.name) ? [full] : [];
  });

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\(\s*)['"]([^'"]+)['"]/g;

/** Capa de un archivo de src, según su primera carpeta. */
const layerOf = (absFile: string): string => path.relative(SRC, absFile).split(path.sep)[0];

interface ImportInfo {
  file: string;
  spec: string;
  targetLayer: string | null; // null = paquete externo
}

const importsOf = (file: string): ImportInfo[] => {
  const code = fs.readFileSync(file, 'utf8').replace(/^\s*(\/\/|\*).*$/gm, '');
  return [...code.matchAll(IMPORT_RE)].map(([, spec]) => {
    if (!spec.startsWith('.')) return { file, spec, targetLayer: null };
    const target = path.resolve(path.dirname(file), spec);
    return { file, spec, targetLayer: target.startsWith(SRC) ? layerOf(target + '.ts') : 'outside' };
  });
};

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/');

const filesIn = (layer: string) => {
  const dir = path.join(SRC, layer);
  return fs.existsSync(dir) ? walk(dir) : [];
};

describe('Fronteras entre capas', () => {
  test('domain no depende de otras capas ni de librerías de I/O', () => {
    const forbiddenPackages = /^(sequelize|pg|ws|express|nodemailer|axios|dotenv|fs|http|https|net)$/;
    const violations: string[] = [];

    for (const file of filesIn('domain')) {
      for (const imp of importsOf(file)) {
        if (imp.targetLayer && imp.targetLayer !== 'domain') violations.push(`${rel(file)} → ${imp.spec}`);
        if (!imp.targetLayer && forbiddenPackages.test(imp.spec)) violations.push(`${rel(file)} → ${imp.spec}`);
      }
      if (/process\.env/.test(fs.readFileSync(file, 'utf8'))) violations.push(`${rel(file)} usa process.env`);
    }

    expect(violations).toEqual([]);
  });

  test('app no depende de interfaces ni de transporte (Express/ws)', () => {
    const violations: string[] = [];

    for (const file of filesIn('app')) {
      for (const imp of importsOf(file)) {
        if (imp.targetLayer === 'interfaces') violations.push(`${rel(file)} → ${imp.spec}`);
        if (!imp.targetLayer && /^(express|ws)$/.test(imp.spec)) violations.push(`${rel(file)} → ${imp.spec}`);
      }
    }

    expect(violations).toEqual([]);
  });

  test('infrastructure solo depende de interfaces en la composición del WebSocket', () => {
    // El servidor WS compone los handlers de interfaces (equivale a server.ts → interfaces)
    const allowed = new Set([
      'infrastructure/websocket/server.ts',
      'infrastructure/websocket/middleware/auth.middleware.ts',
    ]);
    const violations: string[] = [];

    for (const file of filesIn('infrastructure')) {
      if (allowed.has(rel(file))) continue;
      for (const imp of importsOf(file)) {
        if (imp.targetLayer === 'interfaces') violations.push(`${rel(file)} → ${imp.spec}`);
      }
    }

    expect(violations).toEqual([]);
  });

  test('no reaparecen carpetas legadas', () => {
    const legacy = ['services', 'engine', 'game', 'models', 'routes', 'controllers', 'middleware'];
    expect(legacy.filter((dir) => fs.existsSync(path.join(SRC, dir)))).toEqual([]);
  });
});
