// src/scripts/cards/techniques.ts
import Card from '../../infrastructure/database/models/Card';
import CardAbility from '../../infrastructure/database/models/CardAbility';

export const techniques = [
  // Técnicas de Athena
  {
    card: {
      name: "Meteoros de Pegaso",
      type: "technique" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Ráfaga de meteoritos que golpea múltiples objetivos.",
      faction: "Athena"
    },
    ability: {
      name: "Meteoros de Pegaso",
      type: "activa" as const,
      description: "Ataque múltiple a hasta 3 enemigos",
      conditions: {},
      effects: { multi_target: 3, damage: 60, meteor_impact: true }
    }
  },
  {
    card: {
      name: "Rozan Shoryu Ha",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "El dragón ascendente rompe cualquier defensa.",
      faction: "Athena"
    },
    ability: {
      name: "Rozan Shoryu Ha",
      type: "activa" as const,
      description: "Ataque que ignora completamente la defensa",
      conditions: {},
      effects: { ignore_defense: true, damage: 120, uppercut: true }
    }
  },
  {
    card: {
      name: "Polvo de Diamantes",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Cristales de hielo que congelan al enemigo.",
      faction: "Athena"
    },
    ability: {
      name: "Polvo de Diamantes",
      type: "activa" as const,
      description: "Congela al enemigo y causa daño por frío",
      conditions: {},
      effects: { status_effect: "frozen", duration: 2, ice_damage: 80 }
    }
  },
  {
    card: {
      name: "Cadena Nebular",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Cadenas cósmicas que inmovilizan y dañan.",
      faction: "Athena"
    },
    ability: {
      name: "Cadena Nebular",
      type: "activa" as const,
      description: "Inmoviliza al enemigo y reduce su ataque",
      conditions: {},
      effects: { 
        status_effect: "bound", 
        duration: 3, 
        attack_reduction: 40,
        damage: 70
      }
    }
  },
  {
    card: {
      name: "Ave Fénix",
      type: "technique" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "El ave inmortal que renace de las cenizas.",
      faction: "Athena"
    },
    ability: {
      name: "Ave Fénix",
      type: "activa" as const,
      description: "Daño que aumenta según la vida perdida",
      conditions: {},
      effects: { 
        damage_scaling_by_missing_health: 3,
        fire_damage: true,
        resurrection_power: true
      }
    }
  },
  // Técnicas Doradas
  {
    card: {
      name: "Lightning Bolt",
      type: "technique" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Rayo a la velocidad de la luz imposible de esquivar.",
      faction: "Athena"
    },
    ability: {
      name: "Lightning Bolt",
      type: "activa" as const,
      description: "Ataque eléctrico instantáneo con parálisis",
      conditions: {},
      effects: { 
        cannot_dodge: true, 
        electric_damage: 140, 
        paralysis_chance: 40,
        light_speed: true
      }
    }
  },
  {
    card: {
      name: "Galaxian Explosion",
      type: "technique" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "Explosión cósmica que arrasa todo a su paso.",
      faction: "Athena"
    },
    ability: {
      name: "Galaxian Explosion",
      type: "activa" as const,
      description: "Daño masivo en área con drenaje de cosmos",
      conditions: {},
      effects: { 
        area_damage: true, 
        damage: 300, 
        cosmos_drain: 3,
        galaxy_destruction: true
      }
    }
  },
  {
    card: {
      name: "Excalibur",
      type: "technique" as const,
      rarity: "legendary" as const,
      cost: 6,
      description: "La espada sagrada que corta cualquier cosa.",
      faction: "Athena"
    },
    ability: {
      name: "Excalibur",
      type: "activa" as const,
      description: "Corte perfecto que ignora todas las defensas",
      conditions: {},
      effects: { 
        cut_anything: true, 
        ignore_all_defenses: true, 
        damage: 250,
        armor_destruction: true
      }
    }
  },
  // Técnicas de Soporte
  {
    card: {
      name: "Cosmos Ardiente",
      type: "technique" as const,
      rarity: "common" as const,
      cost: 1,
      description: "Eleva el cosmos interior para aumentar el poder.",
      faction: "Athena"
    },
    ability: {
      name: "Cosmos Ardiente",
      type: "activa" as const,
      description: "Aumenta el ataque por 3 turnos",
      conditions: {},
      effects: { 
        attack_bonus_percent: 30, 
        duration: 3,
        cosmos_boost: true
      }
    }
  },
  {
    card: {
      name: "Curación Divina",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Poder sanador de Athena que restaura la vida.",
      faction: "Athena"
    },
    ability: {
      name: "Curación Divina",
      type: "activa" as const,
      description: "Cura mucha vida a un aliado",
      conditions: {},
      effects: { 
        heal_target: 120, 
        remove_status_effects: true,
        divine_blessing: true
      }
    }
  },
  {
    card: {
      name: "Escudo de Athena",
      type: "technique" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "Protección divina que bloquea ataques.",
      faction: "Athena"
    },
    ability: {
      name: "Escudo de Athena",
      type: "activa" as const,
      description: "Protege a todos los aliados del próximo ataque",
      conditions: {},
      effects: { 
        protect_all_allies: true, 
        damage_reduction: 90, 
        duration: 1,
        divine_protection: true
      }
    }
  },
  // Técnicas de Control
  {
    card: {
      name: "Ilusión Psíquica",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Confunde la mente del enemigo.",
      faction: "Athena"
    },
    ability: {
      name: "Ilusión Psíquica",
      type: "activa" as const,
      description: "Confunde al enemigo y reduce su precisión",
      conditions: {},
      effects: { 
        status_effect: "confusion", 
        duration: 3, 
        accuracy_reduction: 50,
        mind_control: true
      }
    }
  },
  {
    card: {
      name: "Telequinesis",
      type: "technique" as const,
      rarity: "rare" as const,
      cost: 2,
      description: "Mueve objetos y enemigos con el poder mental.",
      faction: "Athena"
    },
    ability: {
      name: "Telequinesis",
      type: "activa" as const,
      description: "Reposiciona enemigos y causa daño psíquico",
      conditions: {},
      effects: { 
        move_enemy: true, 
        psychic_damage: 60, 
        position_control: true
      }
    }
  },
  // Técnicas Combinadas
  {
    card: {
      name: "Athena Exclamation",
      type: "technique" as const,
      rarity: "legendary" as const,
      cost: 9,
      description: "Técnica prohibida que iguala el Big Bang.",
      faction: "Athena"
    },
    ability: {
      name: "Athena Exclamation",
      type: "activa" as const,
      description: "Requiere 3 caballeros dorados, daño absoluto",
      conditions: { 
        gold_knights_required: 3, 
        combined_technique: true 
      },
      effects: { 
        absolute_damage: 999, 
        area_devastation: true,
        big_bang_power: true,
        self_damage: 50
      }
    }
  },
  {
    card: {
      name: "Formación de Batalla",
      type: "technique" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "Coordinación táctica que potencia al equipo.",
      faction: "Athena"
    },
    ability: {
      name: "Formación de Batalla",
      type: "activa" as const,
      description: "Todos los aliados reciben bonificaciones",
      conditions: {},
      effects: { 
        all_allies_attack_bonus: 25,
        all_allies_defense_bonus: 25,
        duration: 4,
        tactical_advantage: true
      }
    }
  }
];

export async function createTechniques() {
  console.log('⚡ Creando Técnicas...');
  
  for (const techniqueData of techniques) {
    try {
      // Crear carta
      const card = await Card.create(techniqueData.card);
      console.log(`✅ Carta creada: ${card.name}`);
      
      // Crear habilidad
      await CardAbility.create({
        card_id: card.id,
        ...techniqueData.ability
      });
    } catch (error) {
      console.error(`❌ Error creando ${techniqueData.card.name}:`, error);
    }
  }
  
  console.log(`🎉 ${techniques.length} Técnicas creadas!`);
}