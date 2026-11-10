/**
 * Sincroniza los sobres de la BD con src/config/packs.config.ts (npm run generate:packs).
 *
 * 1. Los sobres que no están en la configuración se retiran: a cada jugador que tenga alguno sin
 *    abrir se le devuelve su precio (PACK_REFUND en user_transactions) y luego se borran
 *    (user_packs, user_pack_pity y pack_cards caen en cascada).
 * 2. Los de la configuración se crean o actualizan por `code`.
 * 3. Informa de las cartas por rareza de cada sobre y de las rarezas que no tienen ninguna.
 *
 * Con dryRun todo se hace dentro de una transacción que se revierte al final.
 */
import { Op, QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import Pack from '../../infrastructure/database/models/Pack';
import User from '../../infrastructure/database/models/User';
import UserPack from '../../infrastructure/database/models/UserPack';
import transactionService from '../../infrastructure/database/services/transaction.service';
import { CARD_RARITIES, type CardRarity } from '../../domain/packs/PackTypes';
import { CARDS_PER_PACK, DEFAULT_PITY_THRESHOLD } from '../../domain/packs/PackConfig';
import type { PackDefinition } from '../../config/packs.config';

export interface PackCatalogReport {
  removed: Array<{ name: string; code: string | null }>;
  refunds: Array<{ user_id: string; pack_name: string; quantity: number; amount: number }>;
  created: string[];
  updated: string[];
  pools: Array<{ code: string; counts: Record<CardRarity, number>; missing: CardRarity[] }>;
  dryRun: boolean;
}

class DryRunRollback extends Error {}

export async function syncPackCatalog(definitions: PackDefinition[], options: { dryRun?: boolean } = {}): Promise<PackCatalogReport> {
  const report: PackCatalogReport = { removed: [], refunds: [], created: [], updated: [], pools: [], dryRun: !!options.dryRun };
  const codes = definitions.map(d => d.code);
  if (new Set(codes).size !== codes.length) throw new Error('Hay sobres con el mismo code en packs.config.ts');

  try {
    await sequelize.transaction(async (transaction) => {
      // 1. Retirar los sobres que ya no están en la configuración, devolviendo los sin abrir
      const obsolete = await Pack.findAll({
        where: { [Op.or]: [{ code: null }, { code: { [Op.notIn]: codes } }] },
        transaction,
      });
      for (const pack of obsolete) {
        const owned = await UserPack.findAll({ where: { pack_id: pack.id }, transaction, lock: transaction.LOCK.UPDATE });
        for (const userPack of owned) {
          if (userPack.quantity < 1) continue;
          const user = await User.findByPk(userPack.user_id, { transaction, lock: transaction.LOCK.UPDATE });
          if (!user) continue;
          const amount = pack.price * userPack.quantity;
          const before = user.currency;
          user.currency += amount;
          await user.save({ transaction });
          await transactionService.logCurrencyTransaction(
            user.id, amount, 'EARN', 'PACK_REFUND',
            `Devolución de ${userPack.quantity}x ${pack.name} (sobre retirado)`.slice(0, 255),
            'pack', pack.id, { pack_name: pack.name, quantity: userPack.quantity, unit_price: pack.price },
            transaction, { before, after: user.currency },
          );
          report.refunds.push({ user_id: user.id, pack_name: pack.name, quantity: userPack.quantity, amount });
        }
        report.removed.push({ name: pack.name, code: pack.code ?? null });
        await pack.destroy({ transaction });
      }

      // 2. Crear o actualizar los sobres de la configuración
      for (const [index, def] of definitions.entries()) {
        const values = {
          code: def.code,
          name: def.name,
          description: def.description,
          price: def.price,
          cards_per_pack: CARDS_PER_PACK,
          guaranteed_rarity: null,
          is_active: true,
          image_url: def.image_url ?? null,
          collections: def.collections,
          coming_soon: def.coming_soon === true,
          pity_threshold: def.pity_threshold ?? DEFAULT_PITY_THRESHOLD,
          sort_order: index,
        };
        const existing = await Pack.findOne({ where: { code: def.code }, transaction });
        if (existing) {
          await existing.update(values, { transaction });
          report.updated.push(def.code);
        } else {
          await Pack.create(values, { transaction });
          report.created.push(def.code);
        }

        // 3. Cartas por rareza del sobre
        const rows = await sequelize.query<{ rarity: string; n: string }>(
          'SELECT rarity::text AS rarity, COUNT(*) AS n FROM cards WHERE collection_id IN (:collections) GROUP BY rarity',
          { replacements: { collections: def.collections }, type: QueryTypes.SELECT, transaction },
        );
        const counts = Object.fromEntries(CARD_RARITIES.map(r => [r, 0])) as Record<CardRarity, number>;
        for (const row of rows) if (row.rarity in counts) counts[row.rarity as CardRarity] = Number(row.n);
        report.pools.push({ code: def.code, counts, missing: CARD_RARITIES.filter(r => counts[r] === 0) });
      }

      if (options.dryRun) throw new DryRunRollback();
    });
  } catch (error) {
    if (!(error instanceof DryRunRollback)) throw error;
  }
  return report;
}
