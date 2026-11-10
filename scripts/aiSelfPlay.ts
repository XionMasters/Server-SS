/**
 * scripts/aiSelfPlay.ts
 *
 * Autojuego: la IA juega partidas completas contra sí misma con las cartas reales del catálogo,
 * por la misma puerta que un jugador (matchesCoordinator.handleAction / SelectionService).
 * Sirve para encontrar cartas o reglas rotas sin jugar a mano: informa de cada jugada que el
 * servidor rechazó, cada excepción, cada error del motor y cada partida que no termina.
 *
 * Uno de los lados es la IA del servidor (app/matches/ai) y el otro un usuario de sistema
 * "IA Sparring" con un mazo aleatorio nuevo en cada partida. Escribe en la base de datos de .env.
 *
 * Uso:
 *   npm run ai:selfplay                          # 5 partidas
 *   npm run ai:selfplay -- --games 20
 *   npm run ai:selfplay -- --faction Poseidon --ai-faction Athena
 *   npm run ai:selfplay -- --out informe.json    # además guarda el informe completo
 *   npm run ai:selfplay -- --verbose             # no silencia los logs del servidor
 */

import { writeFileSync } from 'fs';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';
import '../src/infrastructure/database/models/associations';
import User from '../src/infrastructure/database/models/User';
import Match from '../src/infrastructure/database/models/Match';
import Deck from '../src/infrastructure/database/models/Deck';
import DeckCard from '../src/infrastructure/database/models/DeckCard';
import { buildRandomDeck, type CatalogCard } from '../src/app/decks/randomDeckBuilder';
import { matchesCoordinator } from '../src/app/matches/coordinators/matchesCoordinator';
import { StartMatchService } from '../src/app/matches/lifecycle/startMatch.service';
import { AiOpponentService } from '../src/app/matches/ai/aiOpponent.service';
import { AI_BOT_USER_ID, AI_SPARRING_USER_ID } from '../src/app/matches/ai/aiBot';
import { decideAiMove, END_TURN_KEY, type AiMove } from '../src/app/matches/ai/aiDecision';
import { executeAiMove, loadAiState } from '../src/app/matches/ai/aiTurnRunner';

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const GAMES = Math.max(1, Number(argValue('--games') ?? 5));
const SPARRING_FACTION = argValue('--faction');
const AI_FACTION = argValue('--ai-faction');
const OUT = argValue('--out');
const VERBOSE = args.includes('--verbose');

const SPARRING_USER_ID = AI_SPARRING_USER_ID;
const SPARRING_USERNAME = 'IA Sparring';
const SPARRING_EMAIL = 'sparring@caballeros-cosmicos.invalid';

const MAX_MOVES_PER_GAME = 1500;
const MAX_MOVES_PER_TURN = 40;
const MAX_TURNS = 80;

interface Rejection { game: number; turn: number; player: number; move: string; error: string; cards: string[] }
interface GameReport {
  game: number; match_id: string; sparring_faction: string; ai_faction: string;
  result: 'ai' | 'sparring' | 'draw' | 'stuck' | 'turn_limit' | 'error';
  turns: number; moves: number; rejections: number; detail?: string;
  life: { sparring: number; ai: number };
  /** Quién empezó: 'sparring' (jugador 1) o 'ai' (jugador 2) */
  first: 'sparring' | 'ai';
}

// ── Captura de logs del servidor ─────────────────────────────────────────────
const engineErrors = new Map<string, number>();
const original = { log: console.log, warn: console.warn, error: console.error, info: console.info };
const out = (...m: any[]) => original.log(...m);
const capture = (level: string) => (...m: any[]) => {
  const text = m.map(x => (x instanceof Error ? x.message : typeof x === 'string' ? x : JSON.stringify(x))).join(' ').slice(0, 300);
  if (level !== 'log') engineErrors.set(`[${level}] ${text}`, (engineErrors.get(`[${level}] ${text}`) ?? 0) + 1);
  if (VERBOSE) (original as any)[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](...m);
};
if (!VERBOSE) {
  console.log = capture('log');
  console.info = capture('log');
}
console.warn = capture('warn');
console.error = capture('error');

// ── Preparación ──────────────────────────────────────────────────────────────
async function loadCatalog(): Promise<CatalogCard[]> {
  return sequelize.query<CatalogCard>(
    `SELECT c.id, c.code, c.name, c.type, c.faction, c.rarity, c.max_copies, c."unique", c.tags,
            ct.compatible_tags
       FROM cards c
       LEFT JOIN card_techniques ct ON ct.card_id = c.id`,
    { type: QueryTypes.SELECT },
  );
}

async function ensureSparringUser(): Promise<void> {
  if (await User.findByPk(SPARRING_USER_ID)) return;
  await User.create({
    id: SPARRING_USER_ID,
    username: SPARRING_USERNAME,
    email: SPARRING_EMAIL,
    password_hash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
    is_email_verified: true,
    currency: 0,
  } as any);
}

/** Mazo aleatorio nuevo para el sparring, que queda como su mazo activo. */
async function newSparringDeck(catalog: CatalogCard[]): Promise<string> {
  const generated = buildRandomDeck(catalog, { faction: SPARRING_FACTION });
  await sequelize.transaction(async (transaction) => {
    let deck = await Deck.findOne({ where: { user_id: SPARRING_USER_ID, name: 'Sparring' }, transaction });
    if (!deck) {
      deck = await Deck.create({ user_id: SPARRING_USER_ID, name: 'Sparring', description: 'Autojuego', is_active: true } as any, { transaction });
    } else {
      await DeckCard.destroy({ where: { deck_id: deck.id }, transaction });
      if (!deck.is_active) {
        deck.is_active = true;
        await deck.save({ transaction });
      }
    }
    await DeckCard.bulkCreate(
      generated.cards.map(({ card_id, quantity }) => ({ deck_id: deck!.id, card_id, quantity })),
      { transaction },
    );
  });
  return generated.faction;
}

/** Cierra (por abandono) cualquier partida en curso de los dos lados. */
async function abandonActiveMatches(): Promise<void> {
  const active = await Match.findAll({
    where: {
      phase: { [Op.in]: ['starting', 'player1_turn', 'player2_turn'] },
      [Op.or]: [{ player1_id: SPARRING_USER_ID }, { player2_id: SPARRING_USER_ID }],
    },
  });
  for (const m of active) await matchesCoordinator.abandonMatch(m.id, SPARRING_USER_ID);
}

// ── Una partida ──────────────────────────────────────────────────────────────
function cardNames(state: any, move: AiMove): string[] {
  const byId = new Map<string, any>((state.cards_in_play ?? []).map((c: any) => [String(c.id), c]));
  const ids = move.kind === 'action'
    ? ['card_id', 'knight_id', 'technique_id', 'attacker_id', 'defender_id', 'equip_target_id'].map(k => move.action[k]).filter(Boolean)
    : move.kind === 'selection' && move.chosenCardId ? [move.chosenCardId] : [];
  const names = ids.map(id => {
    const c = byId.get(String(id));
    const p = c?.base_data ?? {};
    return p.name ? `${p.name}${p.code ? ` (${p.code})` : ''}` : String(id);
  });
  if (move.kind === 'action' && move.action.type === 'USE_ABILITY') names.push(`habilidad ${move.action.ability_name}`);
  if (move.kind === 'selection' && state.pending_selection?.source_card_id) {
    const src = byId.get(String(state.pending_selection.source_card_id))?.base_data;
    if (src?.name) names.push(`selección de ${src.name}`);
  }
  return names;
}

async function playGame(game: number, catalog: CatalogCard[], rejections: Rejection[]): Promise<GameReport> {
  await abandonActiveMatches();
  const sparringFaction = await newSparringDeck(catalog);
  const botDeck = await AiOpponentService.ensureBotDeck(AI_FACTION);
  const data = await StartMatchService.startDirectMatch(SPARRING_USER_ID, AI_BOT_USER_ID, botDeck.deckId);
  const matchId: string = data.match_id;
  await matchesCoordinator.buildMatchUpdateEvents(matchId, { type: 'match_start' });

  const report: GameReport = {
    game, match_id: matchId, sparring_faction: sparringFaction, ai_faction: botDeck.faction,
    result: 'stuck', turns: 0, moves: 0, rejections: 0, life: { sparring: 0, ai: 0 },
    first: data.current_player === 2 ? 'ai' : 'sparring',
  };
  const userOf = (p: number) => (p === 1 ? SPARRING_USER_ID : AI_BOT_USER_ID);
  const failed: Record<number, Set<string>> = { 1: new Set(), 2: new Set() };
  let turnKey = '';
  let movesThisTurn = 0;
  let state: any = null;

  try {
    for (; report.moves < MAX_MOVES_PER_GAME; report.moves++) {
      state = await loadAiState(matchId);
      if (!state) { report.result = 'error'; report.detail = 'no se pudo leer el estado'; break; }
      if (state.phase === 'finished') break;
      if (Number(state.current_turn) > MAX_TURNS) { report.result = 'turn_limit'; break; }

      const actor: 1 | 2 = state.pending_selection ? state.pending_selection.player_number : Number(state.current_player);
      const key = `${state.current_turn}:${state.current_player}`;
      if (key !== turnKey) { turnKey = key; failed[1].clear(); failed[2].clear(); movesThisTurn = 0; }

      let move = decideAiMove(state, actor, failed[actor]);
      if (move.kind === 'wait') {
        report.result = 'stuck';
        report.detail = state.pending_selection
          ? `selección pendiente sin opciones (${JSON.stringify(state.pending_selection).slice(0, 200)})`
          : 'la IA no encontró jugada';
        break;
      }
      if (++movesThisTurn > MAX_MOVES_PER_TURN && move.kind === 'action' && move.key !== END_TURN_KEY) {
        move = { kind: 'action', key: END_TURN_KEY, action: { type: 'END_TURN' } };
      }

      let outcome: { ok: boolean; error?: string };
      try {
        outcome = await executeAiMove(matchesCoordinator, matchId, userOf(actor), move);
      } catch (error: any) {
        outcome = { ok: false, error: `EXCEPCIÓN: ${error?.message ?? error}` };
      }
      if (!outcome.ok) {
        failed[actor].add(move.key);
        report.rejections++;
        rejections.push({
          game, turn: Number(state.current_turn), player: actor,
          move: move.kind === 'action' ? String(move.action.type) : 'RESOLVE_SELECTION',
          error: outcome.error ?? 'sin detalle', cards: cardNames(state, move),
        });
        if (move.key === END_TURN_KEY) { report.result = 'stuck'; report.detail = `no puede terminar el turno: ${outcome.error}`; break; }
      }
    }

    const final = await Match.findByPk(matchId);
    report.turns = Number(final?.current_turn ?? 0);
    report.life = { sparring: Number(final?.player1_life ?? 0), ai: Number(final?.player2_life ?? 0) };
    if (final?.phase === 'finished') {
      report.result = final.winner_id === AI_BOT_USER_ID ? 'ai' : final.winner_id === SPARRING_USER_ID ? 'sparring' : 'draw';
    } else if (report.moves >= MAX_MOVES_PER_GAME) {
      report.result = 'stuck';
      report.detail = `más de ${MAX_MOVES_PER_GAME} jugadas`;
    }
  } catch (error: any) {
    report.result = 'error';
    report.detail = error?.stack ?? String(error);
  } finally {
    // No dejar partidas abiertas
    const m = await Match.findByPk(matchId);
    if (m && m.phase !== 'finished') await matchesCoordinator.abandonMatch(matchId, SPARRING_USER_ID);
  }
  return report;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await AiOpponentService.ensureBotUser();
  await ensureSparringUser();
  const catalog = await loadCatalog();
  out(`🤖 Autojuego: ${GAMES} partida(s) · catálogo de ${catalog.length} cartas`);

  const reports: GameReport[] = [];
  const rejections: Rejection[] = [];
  for (let game = 1; game <= GAMES; game++) {
    const started = Date.now();
    const r = await playGame(game, catalog, rejections);
    reports.push(r);
    out(`  #${game} ${r.sparring_faction} vs IA ${r.ai_faction}: ${r.result.toUpperCase()} · turno ${r.turns} · ${r.moves} jugadas · ` +
      `${r.rejections} rechazadas · vidas ${r.life.sparring}-${r.life.ai} · ${((Date.now() - started) / 1000).toFixed(1)} s` +
      (r.detail ? `\n     ⚠️  ${r.detail.split('\n')[0]}` : ''));
  }

  const finished = reports.filter(r => ['ai', 'sparring', 'draw'].includes(r.result)).length;
  out(`\n✅ Terminadas: ${finished}/${GAMES}` +
    ` · gana IA ${reports.filter(r => r.result === 'ai').length}` +
    ` · gana sparring ${reports.filter(r => r.result === 'sparring').length}` +
    ` · atascadas ${reports.filter(r => r.result === 'stuck').length}` +
    ` · límite de turnos ${reports.filter(r => r.result === 'turn_limit').length}` +
    ` · errores ${reports.filter(r => r.result === 'error').length}`);
  const decided = reports.filter(r => r.result === 'ai' || r.result === 'sparring');
  if (decided.length > 0) {
    const firstWins = decided.filter(r => r.result === r.first).length;
    const avgTurns = decided.reduce((s, r) => s + r.turns, 0) / decided.length;
    out(`   Gana quien empieza: ${firstWins}/${decided.length} (${Math.round((firstWins / decided.length) * 100)}%)` +
      ` · duración media: ${avgTurns.toFixed(1)} turnos`);
  }

  // Rechazos agrupados por mensaje + cartas: lo que hay que mirar
  const grouped = new Map<string, { count: number; sample: Rejection }>();
  for (const r of rejections) {
    const k = `${r.move} · ${r.error} · ${r.cards.join(', ')}`;
    const g = grouped.get(k);
    if (g) g.count++; else grouped.set(k, { count: 1, sample: r });
  }
  if (grouped.size > 0) {
    out(`\n❌ Jugadas rechazadas por el servidor (${rejections.length}):`);
    [...grouped.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40)
      .forEach(([k, g]) => out(`  ${String(g.count).padStart(3)}× ${k}`));
  }
  if (engineErrors.size > 0) {
    out(`\n⚠️  Errores y avisos del servidor (${[...engineErrors.values()].reduce((a, b) => a + b, 0)}):`);
    [...engineErrors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
      .forEach(([msg, n]) => out(`  ${String(n).padStart(3)}× ${msg}`));
  }

  if (OUT) {
    writeFileSync(OUT, JSON.stringify({ reports, rejections, engine_errors: Object.fromEntries(engineErrors) }, null, 2), 'utf8');
    out(`\n📝 Informe completo en ${OUT}`);
  }
  if (reports.some(r => r.result === 'error' || r.result === 'stuck')) process.exitCode = 1;
}

main()
  .catch((error) => {
    original.error('❌ Error:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
