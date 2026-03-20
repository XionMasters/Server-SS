/**
 * Inserts the two new occasion cards used to test the selection system:
 *   - resurrection_call  (revive from yomotsu)
 *   - cosmic_offering    (discard from hand → draw 2)
 */
import { sequelize } from '../src/config/database';

const cards = [
  {
    code: 'resurrection_call',
    name: 'Llamada de la Resurrección',
    rarity: 'epic',
    cost: 3,
    description: 'Elige un Caballero del Yomotsu y llévalo al campo de batalla.',
    effects: {
      trigger: 'CARD_PLAYED',
      actions: [
        {
          type: 'request_selection',
          zone: 'yomotsu',
          filter: { type: 'knight' },
          destination: 'field',
          on_select: [
            { type: 'send_to_zone', target: 'selected', destination: 'field' },
          ],
        },
      ],
    },
  },
  {
    code: 'cosmic_offering',
    name: 'Ofrenda Cósmica',
    rarity: 'rare',
    cost: 1,
    description: 'Descarta una carta de tu mano. Roba 2 cartas del mazo.',
    effects: {
      trigger: 'CARD_PLAYED',
      conditions: [{ type: 'hand_not_empty' }],
      actions: [
        {
          type: 'request_selection',
          zone: 'hand',
          filter: {},
          destination: 'cositos',
          on_select: [
            { type: 'send_to_zone', target: 'selected', destination: 'cositos' },
            { type: 'draw_card', amount: 2 },
          ],
        },
      ],
    },
  },
];

async function main() {
  try {
    await sequelize.authenticate();
    console.log('Conexión establecida.');

    for (const card of cards) {
      // Upsert card row
      await sequelize.query(
        `INSERT INTO cards (id, code, name, type, rarity, cost, generate, description,
           image_url, faction, element, max_copies, "unique", playable_zones,
           collection_id, artist, created_at, updated_at)
         VALUES (uuid_generate_v4(), $1, $2, 'occasion', $3, $4, 0, $5,
           '', 'Athena', 'light', 2, false, '{battlefield}', 'santuario', '', NOW(), NOW())
         ON CONFLICT (code) DO UPDATE SET
           name = EXCLUDED.name, rarity = EXCLUDED.rarity, cost = EXCLUDED.cost,
           description = EXCLUDED.description, updated_at = NOW()
         RETURNING id`,
        { bind: [card.code, card.name, card.rarity, card.cost, card.description] }
      );

      // Get card id
      const [rows] = await sequelize.query<{ id: string }>(
        `SELECT id FROM cards WHERE code = $1`,
        { bind: [card.code] }
      ) as any;
      const cardId = rows[0]?.id;
      if (!cardId) { console.error(`No se encontró ID para ${card.code}`); continue; }

      // Delete old abilities
      await sequelize.query(`DELETE FROM card_abilities WHERE card_id = $1`, { bind: [cardId] });

      // Insert new ability
      const abilityKey = card.code;
      await sequelize.query(
        `INSERT INTO card_abilities (id, card_id, name, ability_key, type, description, conditions, effects, created_at)
         VALUES (uuid_generate_v4(), $1, $2, $3, 'pasiva', $4, '{}', $5::jsonb, NOW())`,
        {
          bind: [
            cardId,
            card.name,
            abilityKey,
            card.description,
            JSON.stringify(card.effects),
          ]
        }
      );

      console.log(`✅ ${card.code} (${card.name})`);
    }
  } catch (e: any) {
    console.error('❌', e.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
