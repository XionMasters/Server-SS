// Script para importar cartas completas desde JSON con todos sus datos
import { sequelize } from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';
import fs from 'fs';
import path from 'path';

interface CompleteCardData {
  card_name: string;
  image_url: string;
  type: 'caballero' | 'tecnica' | 'objeto' | 'escenario' | 'ayudante' | 'ocasion';
  rarity: 'comun' | 'rara' | 'epica' | 'legendaria' | 'divina';
  element?: 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark' | null;
  faction?: string | null;
  cost: number;
  description: string;
  knight_stats?: {
    attack: number;
    defense: number;
    health: number;
    cosmos: number;
  };
  abilities: Array<{
    name: string;
    type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
    description: string;
    conditions?: any;
    effects: any;
  }>;
}

interface CardsData {
  cards: CompleteCardData[];
}

async function importCompleteCards(fileName: string = 'cards-complete.json') {
  try {
    await sequelize.authenticate();
    console.log('🔄 Conectando a la base de datos...\n');
    
    const dataPath = path.join(__dirname, fileName);
    
    if (!fs.existsSync(dataPath)) {
      console.log(`⚠️  No se encontró el archivo ${fileName}`);
      console.log('📝 Usa cards-template.json como referencia\n');
      process.exit(1);
    }
    
    const data: CardsData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    
    let cardsCreated = 0;
    let cardsUpdated = 0;
    let cardsSkipped = 0;
    let abilitiesCreated = 0;
    
    console.log(`📋 Procesando ${data.cards.length} cartas...\n`);
    
    for (const cardData of data.cards) {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📄 ${cardData.card_name}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Buscar si ya existe por imagen
      let card = await Card.findOne({ where: { image_url: cardData.image_url } });
      
      if (card) {
        // Actualizar carta existente
        console.log('  🔄 Carta existente, actualizando...');
        
        card.name = cardData.card_name;
        card.type = cardData.type;
        card.rarity = cardData.rarity;
        card.element = cardData.element || null;
        card.faction = cardData.faction || null;
        card.cost = cardData.cost;
        card.description = cardData.description;
        
        await card.save();
        cardsUpdated++;
        console.log('  ✅ Carta actualizada');
      } else {
        // Crear nueva carta
        console.log('  ✨ Creando nueva carta...');
        
        card = await Card.create({
          name: cardData.card_name,
          type: cardData.type,
          rarity: cardData.rarity,
          element: cardData.element || null,
          faction: cardData.faction || null,
          cost: cardData.cost,
          description: cardData.description,
          image_url: cardData.image_url,
        });
        
        cardsCreated++;
        console.log('  ✅ Carta creada');
      }
      
      console.log(`  📊 Tipo: ${cardData.type} | Rareza: ${cardData.rarity} | Costo: ${cardData.cost}`);
      if (cardData.element) {
        console.log(`  🔮 Elemento: ${cardData.element}`);
      }
      if (cardData.faction) {
        console.log(`  ⚔️  Facción: ${cardData.faction}`);
      }
      
      // Si es caballero, crear/actualizar stats
      if (cardData.type === 'caballero' && cardData.knight_stats) {
        let knight = await CardKnight.findOne({ where: { card_id: card.id } });
        
        if (knight) {
          // Actualizar
          knight.attack = cardData.knight_stats.attack;
          knight.defense = cardData.knight_stats.defense;
          knight.health = cardData.knight_stats.health;
          knight.cosmos = cardData.knight_stats.cosmos;
          await knight.save();
          console.log(`  ⚔️  Stats actualizados: ATK ${cardData.knight_stats.attack} | DEF ${cardData.knight_stats.defense} | HP ${cardData.knight_stats.health} | Cosmos ${cardData.knight_stats.cosmos}`);
        } else {
          // Crear
          await CardKnight.create({
            card_id: card.id,
            attack: cardData.knight_stats.attack,
            defense: cardData.knight_stats.defense,
            health: cardData.knight_stats.health,
            cosmos: cardData.knight_stats.cosmos,
          });
          console.log(`  ⚔️  Stats creados: ATK ${cardData.knight_stats.attack} | DEF ${cardData.knight_stats.defense} | HP ${cardData.knight_stats.health} | Cosmos ${cardData.knight_stats.cosmos}`);
        }
      }
      
      // Agregar habilidades
      if (cardData.abilities && cardData.abilities.length > 0) {
        console.log(`  🎯 Habilidades (${cardData.abilities.length}):`);
        
        for (const abilityData of cardData.abilities) {
          // Verificar si ya existe
          const existing = await CardAbility.findOne({
            where: {
              card_id: card.id,
              name: abilityData.name
            }
          });
          
          if (existing) {
            // Actualizar
            existing.type = abilityData.type;
            existing.description = abilityData.description;
            existing.conditions = abilityData.conditions || {};
            existing.effects = abilityData.effects;
            await existing.save();
            console.log(`    🔄 ${abilityData.name} (${abilityData.type}) - actualizada`);
          } else {
            // Crear
            await CardAbility.create({
              card_id: card.id,
              name: abilityData.name,
              type: abilityData.type,
              description: abilityData.description,
              conditions: abilityData.conditions || {},
              effects: abilityData.effects
            });
            console.log(`    ✨ ${abilityData.name} (${abilityData.type}) - creada`);
            abilitiesCreated++;
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Importación completada');
    console.log('='.repeat(60));
    console.log(`✨ Cartas creadas: ${cardsCreated}`);
    console.log(`🔄 Cartas actualizadas: ${cardsUpdated}`);
    console.log(`⏭️  Cartas saltadas: ${cardsSkipped}`);
    console.log(`🎯 Habilidades creadas: ${abilitiesCreated}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Obtener nombre del archivo desde argumentos
const fileName = process.argv[2] || 'cards-complete.json';
importCompleteCards(fileName);
