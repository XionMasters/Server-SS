// src/scripts/import-extended-cards.ts
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';
import fs from 'fs';
import path from 'path';

interface AbilityEffect {
  type: string;
  [key: string]: any;
}

interface Ability {
  name: string;
  type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
  description: string;
  conditions: Record<string, any>;
  effects: AbilityEffect[];
}

interface KnightStats {
  attack: number;
  defense: number;
  health: number;
  cosmos: number;
}

interface CardData {
  id: string;
  card_name: string;
  image_url: string;
  type: 'caballero' | 'tecnica' | 'objeto' | 'escenario' | 'ayudante' | 'ocasion';
  rarity: 'comun' | 'rara' | 'epica' | 'legendaria' | 'divina';
  element?: 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null;
  faction?: string | null;
  cost: number;
  generate: number;
  description?: string;
  knight_stats?: KnightStats;
  abilities?: Ability[];
  max_copies?: number;
  unique?: boolean;
  playable_zones?: string[];
  collection_id?: string;
  artist?: string;
  language?: string;
  balance_notes?: string;
  power_level?: number;
  tags?: string[];
  card_set?: string;
  release_year?: number;
  notes?: string;
}

async function importExtendedCards(jsonFilePath: string) {
  try {
    console.log('📚 Iniciando importación de cartas extendidas...');

    // Conectar a la base de datos
    await sequelize.authenticate();
    console.log('✅ Conectado a la base de datos');

    // Leer el archivo JSON
    const fullPath = path.resolve(jsonFilePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Archivo no encontrado: ${fullPath}`);
    }

    const fileContent = fs.readFileSync(fullPath, 'utf-8');
    const cardsData: CardData[] = JSON.parse(fileContent);

    console.log(`📋 Se encontraron ${cardsData.length} cartas en el archivo`);

    let created = 0;
    let updated = 0;
    let errors = 0;

    for (const cardData of cardsData) {
      try {
        console.log(`\n🔍 Procesando: ${cardData.card_name}`);

        // Buscar si ya existe una carta con este collection_id o image_url
        let existingCard = null;
        if (cardData.collection_id) {
          existingCard = await Card.findOne({
            where: { collection_id: cardData.collection_id }
          });
        }
        
        if (!existingCard && cardData.image_url) {
          existingCard = await Card.findOne({
            where: { image_url: cardData.image_url }
          });
        }

        // Preparar datos de la carta
        const cardValues = {
          id: cardData.id,
          name: cardData.card_name,
          type: cardData.type,
          rarity: cardData.rarity,
          cost: cardData.cost,
          generate: cardData.generate,
          description: cardData.description || null,
          image_url: cardData.image_url,
          faction: cardData.faction || null,
          element: cardData.element || null,
          max_copies: cardData.max_copies !== undefined ? cardData.max_copies : 3,
          unique: cardData.unique || false,
          playable_zones: cardData.playable_zones || ['battlefield'],
          collection_id: cardData.collection_id || null,
          artist: cardData.artist || null,
          language: cardData.language || 'es',
          balance_notes: cardData.balance_notes || null,
          power_level: cardData.power_level || null,
          tags: cardData.tags || [],
          card_set: cardData.card_set || null,
          release_year: cardData.release_year || null,
          notes: cardData.notes || null,
        };

        let card;
        if (existingCard) {
          // Actualizar carta existente
          await existingCard.update(cardValues);
          card = existingCard;
          console.log(`  ✏️  Carta actualizada`);
          updated++;
        } else {
          // Crear nueva carta
          card = await Card.create(cardValues);
          console.log(`  ➕ Carta creada`);
          created++;
        }

        // Si es un caballero, crear o actualizar sus stats
        if (cardData.type === 'caballero' && cardData.knight_stats) {
          const knightData = {
            card_id: card.id,
            attack: cardData.knight_stats.attack,
            defense: cardData.knight_stats.defense,
            health: cardData.knight_stats.health,
            cosmos: cardData.knight_stats.cosmos,
            can_defend: true,
            defense_reduction: 0.5
          };

          const existingKnight = await CardKnight.findByPk(card.id);
          if (existingKnight) {
            await existingKnight.update(knightData);
            console.log(`  ✏️  Stats de caballero actualizados`);
          } else {
            await CardKnight.create(knightData);
            console.log(`  ⚔️  Stats de caballero creados`);
          }
        }

        // Procesar habilidades
        if (cardData.abilities && cardData.abilities.length > 0) {
          // Eliminar habilidades antiguas
          await CardAbility.destroy({ where: { card_id: card.id } });

          // Crear nuevas habilidades
          for (const abilityData of cardData.abilities) {
            await CardAbility.create({
              card_id: card.id,
              name: abilityData.name,
              type: abilityData.type,
              description: abilityData.description,
              conditions: abilityData.conditions || {},
              effects: abilityData.effects || []
            });
          }
          console.log(`  🌟 ${cardData.abilities.length} habilidad(es) creada(s)`);
        }

      } catch (error) {
        console.error(`  ❌ Error procesando ${cardData.card_name}:`, error);
        errors++;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 Resumen de importación:');
    console.log(`  ✅ Cartas creadas: ${created}`);
    console.log(`  ✏️  Cartas actualizadas: ${updated}`);
    console.log(`  ❌ Errores: ${errors}`);
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Error fatal en importación:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonFile = args[0] || 'cards-extended.json';
  
  console.log(`📂 Archivo a importar: ${jsonFile}`);
  
  importExtendedCards(jsonFile)
    .then(() => {
      console.log('✨ Importación completada exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Error en importación:', error);
      process.exit(1);
    });
}

export default importExtendedCards;
