// Script para agregar habilidades a las cartas
// Las habilidades se definen en abilities-data.json
import { sequelize } from '../config/database';
import Card from '../infrastructure/database/models/Card';
import CardAbility from '../infrastructure/database/models/CardAbility';
import fs from 'fs';
import path from 'path';

interface AbilityData {
  card_name: string;
  abilities: Array<{
    name: string;
    type: 'activa' | 'pasiva' | 'equipamiento' | 'campo';
    description: string;
    conditions?: object;
    effects: object;
  }>;
}

async function importAbilities() {
  try {
    await sequelize.authenticate();
    console.log('🔄 Conectando a la base de datos...\n');
    
    const dataPath = path.join(__dirname, 'abilities-data.json');
    
    if (!fs.existsSync(dataPath)) {
      console.log('⚠️  No se encontró el archivo abilities-data.json');
      console.log('📝 Creando archivo de ejemplo...\n');
      
      const exampleData: AbilityData[] = [
        {
          card_name: "Pegasus Seiya",
          abilities: [
            {
              name: "Meteoro de Pegaso",
              type: "activa",
              description: "Lanza 100 meteoros que golpean al enemigo",
              conditions: { cosmos_required: 2 },
              effects: {
                damage: 3,
                target: "single_enemy"
              }
            },
            {
              name: "Cosmos de Pegaso",
              type: "pasiva",
              description: "Aumenta el ataque cuando la vida está baja",
              effects: {
                attack_boost: 2,
                condition: "health_below_50"
              }
            }
          ]
        },
        {
          card_name: "Hilda",
          abilities: [
            {
              name: "Bendición de Odín",
              type: "campo",
              description: "Aumenta el cosmos de todos los guerreros de Asgard",
              effects: {
                cosmos_boost: 1,
                target: "all_asgard_allies",
                duration: "permanent"
              }
            }
          ]
        },
        {
          card_name: "Mjolnir",
          abilities: [
            {
              name: "Poder del Trueno",
              type: "equipamiento",
              description: "Aumenta el ataque del caballero equipado",
              effects: {
                attack_boost: 2,
                compatible_with: ["steel", "asgard"]
              }
            }
          ]
        }
      ];
      
      fs.writeFileSync(dataPath, JSON.stringify(exampleData, null, 2));
      console.log('✅ Archivo abilities-data.json creado con ejemplos');
      console.log('📋 Edita el archivo y vuelve a ejecutar este script\n');
      process.exit(0);
    }
    
    const data: AbilityData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    
    let addedCount = 0;
    let skippedCount = 0;
    
    for (const cardData of data) {
      // Buscar la carta por nombre
      const card = await Card.findOne({ where: { name: cardData.card_name } });
      
      if (!card) {
        console.log(`⚠️  Carta no encontrada: ${cardData.card_name}`);
        skippedCount++;
        continue;
      }
      
      console.log(`\n📋 Procesando: ${cardData.card_name}`);
      
      for (const abilityData of cardData.abilities) {
        // Verificar si ya existe esta habilidad
        const existing = await CardAbility.findOne({
          where: {
            card_id: card.id,
            name: abilityData.name
          }
        });
        
        if (existing) {
          console.log(`  ⏭️  Habilidad ya existe: ${abilityData.name}`);
          skippedCount++;
          continue;
        }
        
        await CardAbility.create({
          card_id: card.id,
          name: abilityData.name,
          type: abilityData.type,
          description: abilityData.description,
          conditions: abilityData.conditions || {},
          effects: abilityData.effects
        });
        
        console.log(`  ✅ Habilidad agregada: ${abilityData.name} (${abilityData.type})`);
        addedCount++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Importación de habilidades completada');
    console.log(`✅ Habilidades agregadas: ${addedCount}`);
    console.log(`⏭️  Habilidades saltadas: ${skippedCount}`);
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importAbilities();
