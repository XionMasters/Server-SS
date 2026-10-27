// src/scripts/cards/objects.ts
import Card from '../../infrastructure/database/models/Card';
import CardAbility from '../../infrastructure/database/models/CardAbility';

export const objects = [
  // Armaduras Sagradas
  {
    card: {
      name: "Armadura de Pegaso",
      type: "item" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Armadura de bronce que protege al caballero de Pegaso.",
      faction: "Athena"
    },
    ability: {
      name: "Protección de Pegaso",
      type: "equipamiento" as const,
      description: "Aumenta defensa y otorga regeneración",
      conditions: { card_type: "knight" },
      effects: { 
        defense_bonus: 40, 
        health_regen: 10, 
        armor_self_repair: true 
      }
    }
  },
  {
    card: {
      name: "Armadura de Sagitario",
      type: "item" as const,
      rarity: "legendary" as const,
      cost: 6,
      description: "Armadura dorada del arquero celestial.",
      faction: "Athena"
    },
    ability: {
      name: "Poder de Sagitario",
      type: "equipamiento" as const,
      description: "Aumenta ataque y otorga precisión perfecta",
      conditions: { card_type: "knight" },
      effects: { 
        attack_bonus: 60, 
        accuracy: 100, 
        bow_mastery: true,
        golden_protection: 30
      }
    }
  },
  // Armas Sagradas
  {
    card: {
      name: "Armas de Libra",
      type: "item" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "Las 12 armas sagradas del caballero de Libra.",
      faction: "Athena"
    },
    ability: {
      name: "Arsenal Sagrado",
      type: "activa" as const,
      description: "Permite usar cualquier arma sagrada",
      conditions: {},
      effects: { 
        weapon_variety: 12, 
        damage_bonus: 50, 
        sacred_weapon_mastery: true,
        pierce_all_defenses: true
      }
    }
  },
  {
    card: {
      name: "Escudo de Athena",
      type: "item" as const,
      rarity: "legendary" as const,
      cost: 5,
      description: "Escudo divino que protege a los elegidos de Athena.",
      faction: "Athena"
    },
    ability: {
      name: "Aegis Divino",
      type: "equipamiento" as const,
      description: "Bloquea ataques y refleja daño",
      conditions: {},
      effects: { 
        block_chance: 60, 
        reflect_damage_percent: 50, 
        divine_protection: true,
        status_immunity: ["petrification", "death"]
      }
    }
  },
  // Joyas y Amuletos
  {
    card: {
      name: "Rosario de Athena",
      type: "item" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "Rosario sagrado que purifica el alma.",
      faction: "Athena"
    },
    ability: {
      name: "Purificación Divina",
      type: "equipamiento" as const,
      description: "Inmunidad a efectos de estado negativos",
      conditions: {},
      effects: { 
        status_immunity: ["poison", "curse", "confusion", "fear"],
        holy_aura: true,
        cosmos_regen: 1
      }
    }
  },
  {
    card: {
      name: "Báculo de Nike",
      type: "item" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Símbolo de la victoria que inspira triunfo.",
      faction: "Athena"
    },
    ability: {
      name: "Aura de Victoria",
      type: "equipamiento" as const,
      description: "Aumenta las probabilidades de éxito",
      conditions: {},
      effects: { 
        critical_chance: 20, 
        dodge_chance: 15, 
        victory_aura: true,
        all_allies_morale_boost: 25
      }
    }
  },
  // Elementos Cósmicos
  {
    card: {
      name: "Cristal de Cosmos",
      type: "item" as const,
      rarity: "rare" as const,
      cost: 2,
      description: "Cristal que almacena energía cósmica pura.",
      faction: "Athena"
    },
    ability: {
      name: "Reserva Cósmica",
      type: "activa" as const,
      description: "Restaura cosmos al usuario",
      conditions: {},
      effects: { 
        cosmos_restore: 3, 
        cosmic_energy: true,
        one_time_use: true
      }
    }
  },
  {
    card: {
      name: "Fragmento de Estrella",
      type: "item" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "Pedazo de estrella caída que contiene poder estelar.",
      faction: "Athena"
    },
    ability: {
      name: "Poder Estelar",
      type: "equipamiento" as const,
      description: "Aumenta el poder de todas las habilidades",
      conditions: {},
      effects: { 
        ability_power_bonus: 30, 
        stellar_energy: true,
        night_combat_bonus: 50
      }
    }
  },
  // Pociones y Consumibles
  {
    card: {
      name: "Néctar Divino",
      type: "item" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Bebida de los dioses que restaura completamente.",
      faction: "Athena"
    },
    ability: {
      name: "Restauración Completa",
      type: "activa" as const,
      description: "Cura toda la vida y elimina efectos negativos",
      conditions: {},
      effects: { 
        full_heal: true, 
        remove_all_debuffs: true,
        divine_blessing: true,
        one_time_use: true
      }
    }
  },
  {
    card: {
      name: "Elixir de Cosmos",
      type: "item" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "Poción que eleva permanentemente el cosmos.",
      faction: "Athena"
    },
    ability: {
      name: "Elevación Cósmica",
      type: "activa" as const,
      description: "Aumenta permanentemente el cosmos máximo",
      conditions: {},
      effects: { 
        permanent_cosmos_increase: 2, 
        cosmic_evolution: true,
        one_time_use: true
      }
    }
  },
  // Reliquias Sagradas
  {
    card: {
      name: "Caja de Pandora",
      type: "item" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Reliquia que contiene tanto bendiciones como maldiciones.",
      faction: "Athena"
    },
    ability: {
      name: "Poder de Pandora",
      type: "activa" as const,
      description: "Efecto aleatorio muy poderoso",
      conditions: {},
      effects: { 
        random_powerful_effect: true,
        pandora_chaos: true,
        unpredictable: true
      }
    }
  },
  {
    card: {
      name: "Lira de Orfeo",
      type: "item" as const,
      rarity: "legendary" as const,
      cost: 6,
      description: "Instrumento que controla las emociones y calma a las bestias.",
      faction: "Athena"
    },
    ability: {
      name: "Melodía Encantadora",
      type: "activa" as const,
      description: "Encanta a todos los enemigos",
      conditions: {},
      effects: { 
        charm_all_enemies: true, 
        duration: 3,
        soothing_melody: true,
        beast_taming: true
      }
    }
  },
  // Elementos Místicos
  {
    card: {
      name: "Polvo de Estrellas",
      type: "item" as const,
      rarity: "common" as const,
      cost: 1,
      description: "Polvo mágico que potencia temporalmente las habilidades.",
      faction: "Athena"
    },
    ability: {
      name: "Potenciación Temporal",
      type: "activa" as const,
      description: "La próxima habilidad es más poderosa",
      conditions: {},
      effects: { 
        next_ability_bonus: 50, 
        stardust_enhancement: true,
        one_time_use: true
      }
    }
  },
  {
    card: {
      name: "Espejo de la Verdad",
      type: "item" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Revela la verdadera naturaleza de las cosas.",
      faction: "Athena"
    },
    ability: {
      name: "Revelación",
      type: "activa" as const,
      description: "Revela todas las cartas ocultas del enemigo",
      conditions: {},
      effects: { 
        reveal_enemy_hand: true, 
        truth_sight: true,
        illusion_dispel: true
      }
    }
  },
  // Objetos de Entrenamiento
  {
    card: {
      name: "Pesas de Mu",
      type: "item" as const,
      rarity: "rare" as const,
      cost: 2,
      description: "Pesas telequinéticas para entrenar el cosmos.",
      faction: "Athena"
    },
    ability: {
      name: "Entrenamiento Intensivo",
      type: "equipamiento" as const,
      description: "Gana experiencia adicional en batalla",
      conditions: {},
      effects: { 
        experience_bonus: 50, 
        training_weights: true,
        stat_growth_bonus: 20
      }
    }
  },
  {
    card: {
      name: "Manual de Combate",
      type: "item" as const,
      rarity: "common" as const,
      cost: 1,
      description: "Técnicas básicas de combate de caballeros.",
      faction: "Athena"
    },
    ability: {
      name: "Conocimiento Marcial",
      type: "equipamiento" as const,
      description: "Mejora la precisión y técnica en combate",
      conditions: {},
      effects: { 
        accuracy_bonus: 15, 
        technique_improvement: true,
        combat_knowledge: true
      }
    }
  }
];

export async function createObjects() {
  console.log('🏺 Creando Objetos Místicos...');
  
  for (const objectData of objects) {
    try {
      // Crear carta
      const card = await Card.create(objectData.card);
      console.log(`✅ Carta creada: ${card.name}`);
      
      // Crear habilidad
      await CardAbility.create({
        card_id: card.id,
        ...objectData.ability
      });
    } catch (error) {
      console.error(`❌ Error creando ${objectData.card.name}:`, error);
    }
  }
  
  console.log(`🎉 ${objects.length} Objetos Místicos creados!`);
}