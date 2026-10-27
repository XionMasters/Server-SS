// Auditoría F1 (solo lectura): detecta cartas de colección que el ledger no justifica.
//
// Mientras POST /api/user-cards estuvo expuesto, un usuario podía darse cartas
// sin pasar por sobres ni recompensas. Esas filas no tienen transacciones que las
// respalden. Este script compara user_cards con user_card_transactions:
//
//   esperado = SUM(ACQUIRE) - SUM(LOSE)   por usuario y carta
//
// Uso: npx ts-node scripts/audit-user-cards.ts [--json]
import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';

interface AuditRow {
  user_id: string;
  username: string | null;
  card_id: string;
  card_name: string | null;
  quantity: number;
  expected: number;
  is_foil: boolean;
  foil_acquisitions: number;
}

const AUDIT_SQL = `
  WITH ledger AS (
    SELECT
      user_id,
      card_id,
      SUM(CASE WHEN type = 'ACQUIRE' THEN quantity ELSE -quantity END) AS expected,
      SUM(CASE WHEN type = 'ACQUIRE' AND is_foil THEN 1 ELSE 0 END)   AS foil_acquisitions
    FROM user_card_transactions
    GROUP BY user_id, card_id
  )
  SELECT
    uc.user_id,
    u.username,
    uc.card_id,
    c.name                             AS card_name,
    uc.quantity::int                   AS quantity,
    COALESCE(l.expected, 0)::int       AS expected,
    uc.is_foil,
    COALESCE(l.foil_acquisitions, 0)::int AS foil_acquisitions
  FROM user_cards uc
  LEFT JOIN ledger l ON l.user_id = uc.user_id AND l.card_id = uc.card_id
  LEFT JOIN users  u ON u.id = uc.user_id
  LEFT JOIN cards  c ON c.id = uc.card_id
  WHERE uc.quantity > COALESCE(l.expected, 0)
     OR (uc.is_foil AND COALESCE(l.foil_acquisitions, 0) = 0)
     OR c.id IS NULL
  ORDER BY (uc.quantity - COALESCE(l.expected, 0)) DESC
`;

async function main() {
  const asJson = process.argv.includes('--json');
  await sequelize.authenticate();

  const [{ total }] = await sequelize.query<{ total: number }>(
    'SELECT COUNT(*)::int AS total FROM user_cards',
    { type: QueryTypes.SELECT }
  );
  const rows = await sequelize.query<AuditRow>(AUDIT_SQL, { type: QueryTypes.SELECT });

  if (asJson) {
    console.log(JSON.stringify({ total, suspicious: rows }, null, 2));
    return;
  }

  console.log(`Filas de user_cards revisadas: ${total}`);
  console.log(`Filas sospechosas: ${rows.length}\n`);

  for (const row of rows) {
    const reasons: string[] = [];
    if (row.card_name === null) reasons.push('carta inexistente');
    if (row.quantity > row.expected) reasons.push(`+${row.quantity - row.expected} sin respaldo en el ledger`);
    if (row.is_foil && row.foil_acquisitions === 0) reasons.push('foil sin adquisición foil');
    console.log(
      `- ${row.username ?? row.user_id} · ${row.card_name ?? row.card_id}: ` +
      `tiene ${row.quantity}, ledger justifica ${row.expected} (${reasons.join('; ')})`
    );
  }

  if (rows.length > 0) {
    console.log('\nNo se ha modificado nada. Revisa cada caso antes de corregir cantidades.');
  }
}

main()
  .catch((error) => {
    console.error('Error en la auditoría:', error);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
