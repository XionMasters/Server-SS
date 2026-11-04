/**
 * scripts/giveRandomDecks.ts
 *
 * Da a cada usuario un mazo aleatorio (pero jugable, ver src/app/decks/randomDeckBuilder.ts),
 * le entrega las copias que le falten para poder usarlo y lo deja como mazo activo.
 * Las cartas entregadas quedan registradas en user_card_transactions (ADMIN_GIFT).
 *
 * Uso:
 *   npx ts-node scripts/giveRandomDecks.ts --dry-run          # muestra qué haría, no escribe
 *   npx ts-node scripts/giveRandomDecks.ts                    # todos los usuarios
 *   npx ts-node scripts/giveRandomDecks.ts --user XionMasters # un usuario (nombre o id)
 *   npx ts-node scripts/giveRandomDecks.ts --faction Poseidon # fuerza la facción
 */

import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';
import '../src/infrastructure/database/models/associations';
import User from '../src/infrastructure/database/models/User';
import UserCard from '../src/infrastructure/database/models/UserCard';
import Deck from '../src/infrastructure/database/models/Deck';
import DeckCard from '../src/infrastructure/database/models/DeckCard';
import DeckBack from '../src/infrastructure/database/models/DeckBack';
import UserDeckBackUnlock from '../src/infrastructure/database/models/UserDeckBackUnlock';
import transactionService from '../src/infrastructure/database/services/transaction.service';
import { buildRandomDeck, CatalogCard } from '../src/app/decks/randomDeckBuilder';
import { validateDeck } from '../src/app/decks/deckValidator';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const argValue = (flag: string) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
};
const USER_ARG = argValue('--user');
const FACTION_ARG = argValue('--faction');

const FACTION_LABEL: Record<string, string> = {
  Athena: 'Santuario',
  Poseidon: 'Poseidón',
  'Black Saints': 'Santos Negros',
};

async function loadCatalog(): Promise<CatalogCard[]> {
  return sequelize.query<CatalogCard>(
    `SELECT c.id, c.code, c.name, c.type, c.faction, c.rarity, c.max_copies, c."unique", c.tags,
            ct.compatible_tags
       FROM cards c
       LEFT JOIN card_techniques ct ON ct.card_id = c.id`,
    { type: QueryTypes.SELECT },
  );
}

async function giveDeck(user: User, catalog: CatalogCard[]): Promise<void> {
  const byId = new Map(catalog.map(c => [c.id, c]));
  const deck = buildRandomDeck(catalog, { faction: FACTION_ARG });

  const validation = await validateDeck(deck.cards);
  if (!validation.valid) {
    throw new Error(`Mazo generado no válido para ${user.username}: ${validation.errors.join('; ')}`);
  }

  const owned = new Map(
    (await UserCard.findAll({ where: { user_id: user.id, card_id: deck.cards.map(c => c.card_id) } }))
      .map(uc => [uc.card_id, uc.quantity]),
  );
  const missing = deck.cards
    .map(({ card_id, quantity }) => ({ card_id, quantity: Math.max(0, quantity - (owned.get(card_id) ?? 0)) }))
    .filter(m => m.quantity > 0);
  const missingTotal = missing.reduce((s, m) => s + m.quantity, 0);

  const label = FACTION_LABEL[deck.faction] ?? deck.faction;
  const deckName = `Mazo aleatorio · ${label}`;

  console.log(`\n👤 ${user.username}  →  ${deckName} (${deck.total} cartas)`);
  console.log(`   Por tipo: ${Object.entries(deck.by_type).map(([t, n]) => `${t} ${n}`).join(', ')}`);
  for (const { card_id, quantity } of deck.cards) {
    const c = byId.get(card_id)!;
    const gift = missing.find(m => m.card_id === card_id)?.quantity ?? 0;
    console.log(`   ${String(quantity).padStart(2)}× ${c.name} [${c.type}, ${c.rarity}]${gift ? `  (+${gift} a la colección)` : ''}`);
  }
  console.log(`   Cartas nuevas para la colección: ${missingTotal}`);
  validation.warnings.forEach(w => console.log(`   ⚠️  ${w}`));

  if (DRY_RUN) return;

  await sequelize.transaction(async (transaction) => {
    // Otros mazos dejan de estar activos: el nuevo es el que usará para buscar partida
    await Deck.update({ is_active: false }, { where: { user_id: user.id, is_active: true }, transaction });

    const created = await Deck.create({
      user_id: user.id,
      name: deckName,
      description: `Mazo generado al azar (${label}).`,
      is_active: true,
    }, { transaction });

    const defaultBack = await DeckBack.findOne({ where: { unlock_type: 'default', is_active: true }, transaction });
    if (defaultBack) {
      created.current_deck_back_id = defaultBack.id;
      await created.save({ transaction });
      await UserDeckBackUnlock.findOrCreate({
        where: { user_id: user.id, deck_back_id: defaultBack.id },
        defaults: { user_id: user.id, deck_back_id: defaultBack.id, unlock_source: 'initial_setup' },
        transaction,
      });
    }

    for (const { card_id, quantity } of missing) {
      const c = byId.get(card_id)!;
      const [userCard, isNew] = await UserCard.findOrCreate({
        where: { user_id: user.id, card_id },
        defaults: { user_id: user.id, card_id, quantity, is_foil: false, acquired_at: new Date() },
        transaction,
      });
      if (!isNew) {
        userCard.quantity += quantity;
        await userCard.save({ transaction });
      }
      await transactionService.logCardTransaction(
        user.id, card_id, quantity, 'ACQUIRE', 'ADMIN_GIFT',
        `Cartas para el ${deckName}`, false, 'deck', created.id,
        { card_name: c.name, card_rarity: c.rarity, card_type: c.type, source: 'random_deck' },
        transaction,
      );
    }

    await DeckCard.bulkCreate(
      deck.cards.map(({ card_id, quantity }) => ({ deck_id: created.id, card_id, quantity })),
      { transaction },
    );
    console.log(`   ✅ Mazo creado (${created.id}) y marcado como activo`);
  });
}

async function main(): Promise<void> {
  const where = USER_ARG
    ? { [Op.or]: [{ username: USER_ARG }, ...(/^[0-9a-f-]{36}$/i.test(USER_ARG) ? [{ id: USER_ARG }] : [])] }
    : {};
  const users = await User.findAll({ where, order: [['username', 'ASC']] });
  if (users.length === 0) {
    console.log(USER_ARG ? `No se encontró el usuario "${USER_ARG}"` : 'No hay usuarios');
    return;
  }

  const catalog = await loadCatalog();
  console.log(`${DRY_RUN ? '🔍 SIMULACIÓN (--dry-run): no se escribe nada' : '✍️  Escribiendo en la base de datos'}`);
  console.log(`Catálogo: ${catalog.length} cartas · Usuarios: ${users.map(u => u.username).join(', ')}`);

  let failed = 0;
  for (const user of users) {
    try {
      await giveDeck(user, catalog);
    } catch (error) {
      failed++;
      console.error(`   ❌ ${user.username}: ${(error as Error).message}`);
    }
  }
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
