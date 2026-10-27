// src/scripts/cards/scenarios.ts
import Card from '../../infrastructure/database/models/Card';
import CardAbility from '../../infrastructure/database/models/CardAbility';

export const scenarios = [
  // Santuario de Athena
  {
    card: {
      name: "Santuario de Athena",
      type: "stage" as const,
      rarity: "legendary" as const,
      cost: 8,
      description: "Tierra sagrada donde los caballeros de Athena entrenan y luchan.",
      faction: "Athena"
    },
    ability: {
      name: "Bendición del Santuario",
      type: "campo" as const,
      description: "Todos los caballeros de Athena reciben bonificaciones",
      conditions: { faction: "Athena" },
      effects: { 
        all_athena_knights_attack_bonus: 30,
        all_athena_knights_defense_bonus: 30,
        cosmos_regen_bonus: 1,
        sacred_ground: true
      }
    }
  },
  {
    card: {
      name: "Casa de Aries",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Primera casa del zodíaco, protegida por Mu.",
      faction: "Athena"
    },
    ability: {
      name: "Barrera Telequinética",
      type: "campo" as const,
      description: "Refleja ataques de proyectiles",
      conditions: { attack_type: "projectile" },
      effects: { 
        reflect_projectiles: true,
        telekinetic_barrier: 70,
        crystal_wall_protection: true
      }
    }
  },
  {
    card: {
      name: "Casa de Leo",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Quinta casa zodiacal, dominio del rayo.",
      faction: "Athena"
    },
    ability: {
      name: "Tormenta Eléctrica",
      type: "campo" as const,
      description: "Ataques eléctricos son más poderosos",
      conditions: { damage_type: "electric" },
      effects: { 
        electric_damage_bonus: 50,
        paralysis_chance_bonus: 20,
        lightning_storm: true
      }
    }
  },
  {
    card: {
      name: "Casa de Virgo",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 6,
      description: "Sexta casa, el jardín de los dioses más cercano al cielo.",
      faction: "Athena"
    },
    ability: {
      name: "Ilusiones de Shaka",
      type: "campo" as const,
      description: "Los enemigos tienen dificultad para distinguir la realidad",
      conditions: { enemy_turn: true },
      effects: { 
        enemy_accuracy_reduction: 30,
        illusion_maze: true,
        confusion_aura: 25
      }
    }
  },
  // Lugares de Entrenamiento
  {
    card: {
      name: "Cinco Picos Antiguos",
      type: "stage" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Montañas sagradas donde Shiryu entrena.",
      faction: "Athena"
    },
    ability: {
      name: "Entrenamiento de Montaña",
      type: "campo" as const,
      description: "Los caballeros de dragón reciben bonificaciones",
      conditions: { knight_constellation: "dragon" },
      effects: { 
        defense_bonus: 50,
        waterfall_training: true,
        mountain_endurance: 40
      }
    }
  },
  {
    card: {
      name: "Bosque de la Muerte",
      type: "stage" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Bosque siniestro donde Ikki fue entrenado.",
      faction: "Athena"
    },
    ability: {
      name: "Supervivencia Extrema",
      type: "campo" as const,
      description: "Los caballeros se vuelven más resistentes",
      conditions: {},
      effects: { 
        all_knights_health_bonus: 30,
        death_resistance: 25,
        survival_instinct: true
      }
    }
  },
  {
    card: {
      name: "Siberia Helada",
      type: "stage" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Tierras congeladas donde Hyoga dominó el hielo.",
      faction: "Athena"
    },
    ability: {
      name: "Frío Extremo",
      type: "campo" as const,
      description: "Los ataques de hielo son más efectivos",
      conditions: { damage_type: "ice" },
      effects: { 
        ice_damage_bonus: 40,
        freeze_duration_bonus: 1,
        absolute_zero_field: true
      }
    }
  },
  // Campos de Batalla
  {
    card: {
      name: "Coliseo Galáctico",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 6,
      description: "Arena cósmica donde se libran batallas épicas.",
      faction: "Athena"
    },
    ability: {
      name: "Gloria de Combate",
      type: "campo" as const,
      description: "Todos los combatientes reciben bonificaciones de ataque",
      conditions: {},
      effects: { 
        all_units_attack_bonus: 25,
        battle_fervor: true,
        cosmic_audience: 20
      }
    }
  },
  {
    card: {
      name: "Templo de Athena",
      type: "stage" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "Santuario interior donde reside la diosa.",
      faction: "Athena"
    },
    ability: {
      name: "Presencia Divina",
      type: "campo" as const,
      description: "Athena protege a sus caballeros",
      conditions: { faction: "Athena" },
      effects: { 
        death_protection: true,
        divine_intervention: 15,
        athena_blessing: true,
        miracle_chance: 10
      }
    }
  },
  // Lugares Místicos
  {
    card: {
      name: "Jardín de los Dioses",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Paraíso divino donde florecen plantas sagradas.",
      faction: "Athena"
    },
    ability: {
      name: "Regeneración Natural",
      type: "campo" as const,
      description: "Todas las unidades se curan lentamente",
      conditions: {},
      effects: { 
        all_units_health_regen: 15,
        natural_healing: true,
        paradise_effect: true
      }
    }
  },
  {
    card: {
      name: "Biblioteca de Athena",
      type: "stage" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Repositorio de todo el conocimiento del cosmos.",
      faction: "Athena"
    },
    ability: {
      name: "Sabiduría Ancestral",
      type: "campo" as const,
      description: "Las técnicas cuestan menos cosmos",
      conditions: { card_type: "technique" },
      effects: { 
        technique_cost_reduction: 1,
        knowledge_bonus: true,
        wisdom_of_ages: 25
      }
    }
  },
  {
    card: {
      name: "Lago de los Cisnes",
      type: "stage" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Lago sereno donde Hyoga entrena su cosmos.",
      faction: "Athena"
    },
    ability: {
      name: "Serenidad Helada",
      type: "campo" as const,
      description: "Inmunidad a efectos de estado emocionales",
      conditions: {},
      effects: { 
        emotion_immunity: true,
        tranquil_waters: true,
        ice_affinity: 30
      }
    }
  },
  // Lugares Peligrosos
  {
    card: {
      name: "Tartarus Infernal",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Prisión de las almas condenadas en el inframundo.",
      faction: "Athena"
    },
    ability: {
      name: "Tormento Eterno",
      type: "campo" as const,
      description: "Todas las unidades reciben daño por turno",
      conditions: {},
      effects: { 
        all_units_burn_damage: 20,
        soul_torment: true,
        infernal_flames: true
      }
    }
  },
  {
    card: {
      name: "Dimensión Distorsionada",
      type: "stage" as const,
      rarity: "epic" as const,
      cost: 6,
      description: "Espacio-tiempo alterado donde las reglas no aplican.",
      faction: "Athena"
    },
    ability: {
      name: "Caos Dimensional",
      type: "campo" as const,
      description: "Efectos aleatorios cada turno",
      conditions: {},
      effects: { 
        random_effects: true,
        dimensional_chaos: true,
        reality_distortion: 40
      }
    }
  },
  // Escenarios Neutrales
  {
    card: {
      name: "Campo de Batalla Neutral",
      type: "stage" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Terreno equilibrado sin ventajas especiales.",
      faction: "Athena"
    },
    ability: {
      name: "Terreno Equilibrado",
      type: "campo" as const,
      description: "No hay bonificaciones ni penalizaciones",
      conditions: {},
      effects: { 
        balanced_field: true,
        no_special_effects: true
      }
    }
  }
];

export async function createScenarios() {
  console.log('🏛️ Creando Escenarios...');
  
  for (const scenarioData of scenarios) {
    try {
      // Crear carta
      const card = await Card.create(scenarioData.card);
      console.log(`✅ Carta creada: ${card.name}`);
      
      // Crear habilidad
      await CardAbility.create({
        card_id: card.id,
        ...scenarioData.ability
      });
    } catch (error) {
      console.error(`❌ Error creando ${scenarioData.card.name}:`, error);
    }
  }
  
  console.log(`🎉 ${scenarios.length} Escenarios creados!`);
}