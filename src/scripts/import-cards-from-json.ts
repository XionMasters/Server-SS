import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import sequelize from '../config/database';
import Card from '../models/Card';
import CardKnight from '../models/CardKnight';
import CardAbility from '../models/CardAbility';
import CardTranslation from '../models/CardTranslation';

dotenv.config();

interface TranslatableText {
  es: string;
  en?: string;
  pt?: string;
  [key: string]: string | undefined;
}

interface CardJSON {
  id?: string;
  // Soporta ambos formatos: name (string) o names (objeto multiidioma)
  name?: string;
  names?: TranslatableText;
  type: 'caballero' | 'tecnica' | 'objeto' | 'escenario' | 'ayudante' | 'ocasion';
  rarity: 'comun' | 'rara' | 'epica' | 'legendaria' | 'divina';
  cost: number;
  generate: number;
  description?: string;
  descriptions?: TranslatableText;
  image_url?: string;
  faction?: string;
  element?: 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark';
  knight_stats?: {
    attack: number;
    defense: number;
    health: number;
    cosmos: number;
  };
  abilities?: Array<{
    name?: string;
    names?: TranslatableText;
    type: 'active' | 'passive' | 'trigger';
    cosmos_cost?: number;
    description?: string;
    descriptions?: TranslatableText;
    effects: any;
    conditions?: any;
  }>;
}

interface TemplateDefaults {
  type?: string;
  faction?: string;
  element?: string;
  cost?: number;
  generate?: number;
  artist?: string;
  set?: string;
  release_year?: number;
  notes?: string;
  max_copies?: number;
  unique?: boolean;
  playable_zones?: string[];
  collection_id?: string | null;
  language?: string;
  balance_notes?: string;
  power_level?: number | null;
  common_abilities?: Record<string, any>;
}

interface CardsFile {
  template?: string;
  defaults?: TemplateDefaults;
  cards: CardJSON[];
}

function loadTemplate(templateName: string, basePath: string): TemplateDefaults {
  try {
    const templatePath = join(basePath, 'template.json');
    const templateContent = readFileSync(templatePath, 'utf-8');
    const template = JSON.parse(templateContent);
    
    if (template.template === templateName) {
      console.log(`📋 Plantilla "${templateName}" cargada`);
      return template.defaults || {};
    }
    
    return {};
  } catch (error) {
    console.log(`⚠️  No se encontró plantilla, usando valores por defecto`);
    return {};
  }
}

function mergeWithDefaults(card: CardJSON, defaults: TemplateDefaults): CardJSON {
  const merged: any = { ...defaults, ...card };
  
  // Resolver habilidades con referencia @
  if (merged.abilities && defaults.common_abilities) {
    merged.abilities = merged.abilities.map((ability: any) => {
      if (typeof ability === 'string' && ability.startsWith('@')) {
        const refName = ability.substring(1);
        const commonAbility = defaults.common_abilities![refName];
        
        if (commonAbility) {
          return { name: refName, ...commonAbility };
        }
        
        console.warn(`⚠️  Habilidad común "${refName}" no encontrada`);
        return ability;
      }
      return ability;
    });
  }
  
  return merged;
}

async function importCardsFromJSON(filePath: string, updateExisting: boolean = false) {
  const transaction = await sequelize.transaction();
  
  try {
    console.log(`📖 Leyendo archivo: ${filePath}`);
    const fileContent = readFileSync(filePath, 'utf-8');
    const data: CardsFile = JSON.parse(fileContent);
    
    if (!data.cards || !Array.isArray(data.cards)) {
      throw new Error('El archivo debe contener un array "cards"');
    }
    
    // Cargar plantilla si existe
    let defaults: TemplateDefaults = {};
    if (data.template) {
      const basePath = join(filePath, '..');
      defaults = loadTemplate(data.template, basePath);
    }
    
    // Fusionar defaults del archivo con los de la plantilla
    if (data.defaults) {
      defaults = { ...defaults, ...data.defaults };
    }
    
    console.log(`📦 Encontradas ${data.cards.length} cartas en el archivo\n`);
    
    let created = 0;
    let updated = 0;
    let skipped = 0;
    
    for (let cardData of data.cards) {
      try {
        // Fusionar con defaults
        cardData = mergeWithDefaults(cardData, defaults);
        
        // Obtener nombre en español (formato prioritario)
        const nameES = cardData.names?.es || cardData.name;
        if (!nameES) {
          throw new Error('La carta debe tener un nombre en español (names.es o name)');
        }
        
        // Buscar si ya existe (por nombre en español)
        let card = await Card.findOne({
          where: { name: nameES },
          transaction
        });
        
        if (card && !updateExisting) {
          console.log(`⏭️  "${nameES}" ya existe, omitiendo`);
          skipped++;
          continue;
        }
        
        // Crear o actualizar carta base
        const descriptionES = cardData.descriptions?.es || cardData.description || null;
        
        const cardAttributes = {
          name: nameES,
          type: cardData.type,
          rarity: cardData.rarity,
          cost: cardData.cost,
          generate: cardData.generate,
          description: descriptionES,
          image_url: cardData.image_url || null,
          faction: cardData.faction || null,
          element: cardData.element || null
        };
        
        if (card) {
          await card.update(cardAttributes, { transaction });
          console.log(`🔄 "${nameES}" actualizada`);
          updated++;
        } else {
          card = await Card.create(cardAttributes, { transaction });
          console.log(`✅ "${nameES}" creada`);
          created++;
        }
        
        // Crear/actualizar traducciones de la carta
        if (cardData.names || cardData.descriptions) {
          const languages = ['en', 'pt'];
          
          for (const lang of languages) {
            const translatedName = cardData.names?.[lang];
            const translatedDesc = cardData.descriptions?.[lang];
            
            if (translatedName || translatedDesc) {
              const existingTranslation = await CardTranslation.findOne({
                where: { card_id: card.id, language: lang },
                transaction
              });
              
              const translationData = {
                card_id: card.id,
                language: lang,
                name: translatedName || nameES,
                description: translatedDesc || descriptionES
              };
              
              if (existingTranslation) {
                await existingTranslation.update(translationData, { transaction });
              } else {
                await CardTranslation.create(translationData, { transaction });
              }
              
              console.log(`   🌐 Traducción [${lang}]: "${translatedName || nameES}"`);
            }
          }
        }
        
        // Si es caballero, crear/actualizar stats
        if (cardData.type === 'caballero' && cardData.knight_stats) {
          const knightData = {
            card_id: card.id,
            attack: cardData.knight_stats.attack,
            defense: cardData.knight_stats.defense,
            health: cardData.knight_stats.health,
            cosmos: cardData.knight_stats.cosmos || 0
          };
          
          const existingKnight = await CardKnight.findOne({
            where: { card_id: card.id },
            transaction
          });
          
          if (existingKnight) {
            await existingKnight.update(knightData, { transaction });
          } else {
            await CardKnight.create(knightData, { transaction });
          }
          
          console.log(`   ⚔️  Stats: ATK ${knightData.attack} | DEF ${knightData.defense} | HP ${knightData.health}`);
        }
        
        // Crear habilidades
        if (cardData.abilities && cardData.abilities.length > 0) {
          // Eliminar habilidades antiguas si estamos actualizando
          if (updateExisting) {
            await CardAbility.destroy({
              where: { card_id: card.id },
              transaction
            });
          }
          
          for (const abilityData of cardData.abilities) {
            const abilityNameES = abilityData.names?.es || abilityData.name || 'Habilidad sin nombre';
            const abilityDescES = abilityData.descriptions?.es || abilityData.description || '';
            
            const ability = await CardAbility.create({
              card_id: card.id,
              name: abilityNameES,
              type: abilityData.type,
              cosmos_cost: abilityData.cosmos_cost || 0,
              description: abilityDescES,
              effects: abilityData.effects,
              conditions: abilityData.conditions || {}
            }, { transaction });
            
            console.log(`   💫 Habilidad: "${abilityNameES}" (${abilityData.type})`);
            
            // Traducciones de habilidades
            if (abilityData.names || abilityData.descriptions) {
              const languages = ['en', 'pt'];
              
              for (const lang of languages) {
                const translatedAbilityName = abilityData.names?.[lang];
                const translatedAbilityDesc = abilityData.descriptions?.[lang];
                
                if (translatedAbilityName || translatedAbilityDesc) {
                  await CardTranslation.create({
                    card_id: card.id,
                    ability_id: ability.id,
                    language: lang,
                    name: translatedAbilityName || abilityNameES,
                    description: translatedAbilityDesc || abilityDescES
                  }, { transaction });
                  
                  console.log(`      🌐 [${lang}]: "${translatedAbilityName || abilityNameES}"`);
                }
              }
            }
          }
        }
        
        console.log('');
      } catch (error: any) {
        console.error(`❌ Error procesando "${cardData.name}":`, error.message);
        throw error;
      }
    }
    
    await transaction.commit();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMEN:');
    console.log(`   ✅ Creadas: ${created}`);
    console.log(`   🔄 Actualizadas: ${updated}`);
    console.log(`   ⏭️  Omitidas: ${skipped}`);
    console.log(`   📦 Total: ${data.cards.length}`);
    console.log('='.repeat(60));
    
  } catch (error: any) {
    await transaction.rollback();
    console.error('\n❌ Error importando cartas:', error.message);
    throw error;
  }
}

// Ejecutar
async function main() {
  await sequelize.authenticate();
  console.log('🔌 Conectado a la base de datos\n');
  
  // Ruta del archivo JSON
  const jsonPath = process.argv[2] || join(__dirname, '../assets/black/data.json');
  const updateMode = process.argv[3] === '--update';
  
  console.log(`📁 Archivo: ${jsonPath}`);
  console.log(`🔧 Modo: ${updateMode ? 'ACTUALIZAR' : 'SOLO CREAR'}\n`);
  
  await importCardsFromJSON(jsonPath, updateMode);
  
  await sequelize.close();
  console.log('\n✅ Importación completada');
}

main().catch((error) => {
  console.error('💥 Error fatal:', error);
  process.exit(1);
});
