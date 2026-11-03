/**
 * Valida que las habilidades de los JSON de database/ (lo que carga loadFromJson)
 * solo usen triggers, acciones, objetivos, condiciones y estados que el motor conoce.
 * Una carta con un nombre desconocido no falla al cargarse: falla (o no hace nada) en partida.
 */
import fs from 'fs';
import path from 'path';
import { GameEventType } from '../../src/domain/game/events/GameEvents';
import { ActionRegistry } from '../../src/domain/game/actions/ActionRegistry';
import { TargetResolver } from '../../src/domain/game/targets/TargetResolver';
import { ConditionRegistry } from '../../src/domain/game/conditions/ConditionRegistry';
import { EFFECT_CATEGORY } from '../../src/domain/game/StatusEffects';
import { parseAbilityDef } from '../../src/domain/game/abilities/AbilityDefinition';

const DATABASE_DIR = path.resolve(__dirname, '../../database');

const ABILITY_TYPES = new Set(['activa', 'pasiva', 'equipamiento', 'campo']);
const TRIGGERS = new Set<string>([...Object.values(GameEventType), 'NONE']);
const COST_TYPES = new Set(['cosmos', 'discard', 'life', 'player_cosmos']);
/** Acciones cuyo `target` es un jugador, no una carta. */
const PLAYER_ACTIONS = new Set(['apply_player_damage', 'apply_cosmos_damage', 'heal_player']);
const AMOUNT_ACTIONS = new Set([
  'heal', 'apply_damage', 'restore_cosmos', 'apply_player_damage',
  'apply_cosmos_damage', 'heal_player', 'permanent_ar_reduce', 'modify_stat',
]);
const MODIFY_STATS = new Set(['attack', 'defense', 'cosmos', 'health']);
/** Triggers que se emiten para cualquier carta: una pasiva de caballero debe acotarse a sí misma. */
const CARD_SCOPED_TRIGGERS = new Set(['BA_DEALT', 'BA_RECEIVED', 'TA_DEALT', 'TA_RECEIVED', 'DAMAGE_DEALT', 'ATTACK_CONNECTED']);
const BRANCHES = ['heads', 'on_heads', 'tails', 'on_fail', 'on_select'];

interface AbilityRow {
  where: string;
  cardType: string;
  ability: any;
}

/** code → archivos donde aparece (loadFromJson hace upsert por code: el último gana). */
function collectCodes(): Map<string, string[]> {
  const codes = new Map<string, string[]>();
  for (const file of walk(DATABASE_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) continue;
    for (const card of JSON.parse(text).cards ?? []) {
      if (!card?.code) continue;
      codes.set(card.code, [...(codes.get(card.code) ?? []), path.relative(DATABASE_DIR, file)]);
    }
  }
  return codes;
}

/** JSON que carga loadFromJson (excluye database/bkp/, copias antiguas que no se cargan). */
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'bkp' ? [] : walk(full);
    return entry.name.endsWith('.json') ? [full] : [];
  });

function collectAbilities(): AbilityRow[] {
  const rows: AbilityRow[] = [];
  for (const file of walk(DATABASE_DIR)) {
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) continue;
    const data = JSON.parse(text);
    const visit = (node: any, fileType: string) => {
      if (Array.isArray(node)) return node.forEach(n => visit(n, fileType));
      if (!node || typeof node !== 'object') return;
      if (node.code && Array.isArray(node.abilities)) {
        for (const ability of node.abilities) {
          rows.push({
            where: `${path.relative(DATABASE_DIR, file)}:${node.code} "${ability.name}"`,
            cardType: node.type ?? fileType,
            ability,
          });
        }
      }
      for (const value of Object.values(node)) {
        if (value && typeof value === 'object') visit(value, fileType);
      }
    };
    visit(data, data.type);
  }
  return rows;
}

function checkActions(actions: any[], report: (msg: string) => void): void {
  for (const action of actions) {
    if (!ActionRegistry.has(action.type)) report(`acción desconocida "${action.type}"`);
    if (action.target !== undefined) {
      const known = PLAYER_ACTIONS.has(action.type)
        ? action.target === 'self' || action.target === 'opponent'
        : TargetResolver.has(action.target);
      if (!known) report(`objetivo desconocido "${action.target}" en ${action.type}`);
    }
    if (AMOUNT_ACTIONS.has(action.type) && typeof action.amount !== 'number') {
      report(`${action.type} sin "amount"`);
    }
    if (action.type === 'modify_stat' && !MODIFY_STATS.has(action.stat)) {
      report(`modify_stat con stat inválido "${action.stat}"`);
    }
    if (action.type === 'apply_status') {
      if (!(action.status in EFFECT_CATEGORY)) report(`estado no declarado "${action.status}"`);
      const immobilizes = action.status === 'frozen' || action.status === 'paralyzed';
      if (immobilizes && action.target !== 'self' && (action.duration ?? 1) < 2) {
        report(`${action.status} con duration < 2: caduca antes del turno del afectado`);
      }
    }
    for (const branch of BRANCHES) {
      if (Array.isArray(action[branch])) checkActions(action[branch], report);
    }
  }
}

describe('Integridad de las habilidades en database/*.json', () => {
  test('cada carta tiene code, name y una rareza del ENUM de cards', () => {
    const rarities = new Set(['common', 'rare', 'epic', 'legendary', 'divine']);
    const problems: string[] = [];
    for (const file of walk(DATABASE_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim()) continue;
      for (const card of JSON.parse(text).cards ?? []) {
        const where = `${path.relative(DATABASE_DIR, file)}:${card?.code ?? '?'}`;
        // loadFromJson salta en silencio las entradas sin code/name
        if (!card?.code || !card?.name) problems.push(`${where}: falta code o name`);
        if (!rarities.has(card?.rarity)) problems.push(`${where}: rareza inválida "${card?.rarity}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('cada caballero único declara su personaje (character)', () => {
    const missing: string[] = [];
    for (const file of walk(DATABASE_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim()) continue;
      for (const card of JSON.parse(text).cards ?? []) {
        if (card?.stats?.attack !== undefined && card.unique === true && typeof card.character !== 'string') {
          missing.push(`${path.relative(DATABASE_DIR, file)}:${card.code}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  test('las técnicas solo usan ta_effects que el motor conoce', () => {
    const problems: string[] = [];
    for (const file of walk(DATABASE_DIR)) {
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim()) continue;
      for (const card of JSON.parse(text).cards ?? []) {
        for (const effect of card?.technique_stats?.ta_effects ?? []) {
          if (effect.type !== 'remove_mode' && !(effect.type in EFFECT_CATEGORY)) {
            problems.push(`${path.relative(DATABASE_DIR, file)}:${card.code}: ta_effect desconocido "${effect.type}"`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('cada code de carta aparece una sola vez', () => {
    const duplicated = [...collectCodes()]
      .filter(([, files]) => files.length > 1)
      .map(([code, files]) => `${code}: ${files.join(', ')}`);
    expect(duplicated).toEqual([]);
  });

  test('todas las habilidades usan elementos que el motor soporta', () => {
    const problems: string[] = [];

    for (const { where, cardType, ability } of collectAbilities()) {
      const report = (msg: string) => problems.push(`${where}: ${msg}`);

      if (!ABILITY_TYPES.has(ability.type)) report(`tipo de habilidad desconocido "${ability.type}"`);

      const def = parseAbilityDef(ability.effects);
      if (!def) {
        report('effects inválido (requiere trigger y actions[])');
        continue;
      }
      if (!TRIGGERS.has(def.trigger)) report(`trigger desconocido "${def.trigger}"`);
      if ((def as any).selection) report('campo "selection" no soportado: usar request_selection');

      for (const cost of def.cost ?? []) {
        if (!COST_TYPES.has(cost.type)) report(`coste desconocido "${cost.type}"`);
      }
      const conditionTypes = (def.conditions ?? []).map(c => c.type);
      for (const type of conditionTypes) {
        if (!ConditionRegistry.has(type)) report(`condición desconocida "${type}"`);
      }

      const scopedToSelf = conditionTypes.includes('event_source_is_self')
        || conditionTypes.includes('event_target_is_self');
      if (cardType === 'knight' && CARD_SCOPED_TRIGGERS.has(def.trigger)
          && def.actions.length > 0 && !scopedToSelf) {
        report(`trigger ${def.trigger} sin event_source_is_self: reacciona a cualquier carta`);
      }

      checkActions(def.actions, report);
    }

    expect(problems).toEqual([]);
  });
});
