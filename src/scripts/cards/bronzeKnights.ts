// src/scripts/cards/bronzeKnights.ts
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardAbility from '../../models/CardAbility';

export const bronzeKnights = [
  {
    // Caballeros Principales
    card: {
      name: "Seiya de Pegaso",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "El caballero de bronce más determinado, protector de Athena.",
      faction: "Athena"
    },
    knight: {
      attack: 120,
      defense: 90,
      health: 150,
      cosmos: 3,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Meteoros de Pegaso",
        type: "activa" as const,
        description: "Ataque múltiple que golpea hasta 3 enemigos",
        conditions: { cosmos_min: 2 },
        effects: { multi_target: 3, damage_reduction: 0.7 }
      },
      {
        name: "Determinación Inquebrantable",
        type: "pasiva" as const,
        description: "Cuando la vida es menor al 30%, +50% de ataque",
        conditions: { health_percent_max: 30 },
        effects: { attack_bonus_percent: 50 }
      }
    ]
  },
  {
    card: {
      name: "Shiryu de Dragón",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "El caballero más defensivo, maestro del Rozan Shoryu Ha.",
      faction: "Athena"
    },
    knight: {
      attack: 100,
      defense: 130,
      health: 180,
      cosmos: 3,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Rozan Shoryu Ha",
        type: "activa" as const,
        description: "Ataque devastador que ignora defensa",
        conditions: { cosmos_min: 3 },
        effects: { ignore_defense: true, damage: 150 }
      },
      {
        name: "Escudo del Dragón",
        type: "pasiva" as const,
        description: "En modo defensivo, refleja 30% del daño",
        conditions: { is_defending: true },
        effects: { reflect_damage_percent: 30 }
      }
    ]
  },
  {
    card: {
      name: "Hyoga de Cisne",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Maestro del hielo, con ataques que congelan al enemigo.",
      faction: "Athena"
    },
    knight: {
      attack: 110,
      defense: 100,
      health: 140,
      cosmos: 3,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Polvo de Diamantes",
        type: "activa" as const,
        description: "Congela al enemigo por 1 turno",
        conditions: { cosmos_min: 2 },
        effects: { status_effect: "frozen", duration: 1, damage: 80 }
      },
      {
        name: "Frialdad Absoluta",
        type: "pasiva" as const,
        description: "Inmune a efectos de estado negativos",
        conditions: {},
        effects: { status_immunity: ["poison", "burn", "confusion"] }
      }
    ]
  },
  {
    card: {
      name: "Shun de Andrómeda",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "El más gentil de los caballeros, pero letal con sus cadenas.",
      faction: "Athena"
    },
    knight: {
      attack: 90,
      defense: 110,
      health: 160,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Cadena Espiral",
        type: "activa" as const,
        description: "Ata al enemigo, reduciendo su ataque por 2 turnos",
        conditions: { cosmos_min: 2 },
        effects: { status_effect: "bound", attack_reduction: 50, duration: 2 }
      },
      {
        name: "Corazón Bondadoso",
        type: "pasiva" as const,
        description: "Cura 20 HP a todos los aliados al inicio del turno",
        conditions: {},
        effects: { heal_allies: 20, trigger: "turn_start" }
      }
    ]
  },
  {
    card: {
      name: "Ikki de Fénix",
      type: "knight" as const,
      rarity: "epic" as const,
      cost: 4,
      description: "El caballero inmortal que renace de sus cenizas.",
      faction: "Athena"
    },
    knight: {
      attack: 140,
      defense: 80,
      health: 120,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.6
    },
    abilities: [
      {
        name: "Ave Fénix",
        type: "activa" as const,
        description: "Ataque que aumenta de poder según el daño recibido",
        conditions: { cosmos_min: 3 },
        effects: { damage_scaling_by_missing_health: 2 }
      },
      {
        name: "Renacimiento",
        type: "pasiva" as const,
        description: "Al morir, revive con 50% de vida (una vez por batalla)",
        conditions: { death_trigger: true },
        effects: { revive: true, revive_health_percent: 50, once_per_battle: true }
      }
    ]
  },
  // Caballeros Secundarios
  {
    card: {
      name: "Jabu de Unicornio",
      type: "knight" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Caballero leal con un cuerno perforador.",
      faction: "Athena"
    },
    knight: {
      attack: 80,
      defense: 70,
      health: 100,
      cosmos: 2,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Galope del Unicornio",
        type: "activa" as const,
        description: "Ataque rápido con penetración",
        conditions: { cosmos_min: 1 },
        effects: { armor_pierce: 30, damage: 60 }
      }
    ]
  },
  {
    card: {
      name: "Geki de Oso",
      type: "knight" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Caballero con la fuerza bruta de un oso.",
      faction: "Athena"
    },
    knight: {
      attack: 100,
      defense: 60,
      health: 120,
      cosmos: 2,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Abrazo del Oso",
        type: "activa" as const,
        description: "Inmoviliza al enemigo y causa daño continuo",
        conditions: { cosmos_min: 2 },
        effects: { status_effect: "grappled", damage_per_turn: 15, duration: 2 }
      }
    ]
  },
  {
    card: {
      name: "Ban de León Menor",
      type: "knight" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Caballero ágil con garras afiladas.",
      faction: "Athena"
    },
    knight: {
      attack: 90,
      defense: 50,
      health: 90,
      cosmos: 2,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Garra del León",
        type: "activa" as const,
        description: "Ataque que causa sangrado",
        conditions: { cosmos_min: 1 },
        effects: { status_effect: "bleeding", damage_per_turn: 10, duration: 3 }
      }
    ]
  },
  {
    card: {
      name: "Nachi de Lobo",
      type: "knight" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Caballero salvaje con instintos de caza.",
      faction: "Athena"
    },
    knight: {
      attack: 85,
      defense: 55,
      health: 95,
      cosmos: 2,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Aullido del Lobo",
        type: "activa" as const,
        description: "Intimida a todos los enemigos, reduciendo su ataque",
        conditions: { cosmos_min: 2 },
        effects: { intimidate_all: true, attack_reduction: 20, duration: 2 }
      }
    ]
  },
  {
    card: {
      name: "Ichi de Hidra",
      type: "knight" as const,
      rarity: "common" as const,
      cost: 2,
      description: "Caballero venenoso con múltiples ataques.",
      faction: "Athena"
    },
    knight: {
      attack: 70,
      defense: 65,
      health: 110,
      cosmos: 3,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Veneno de Hidra",
        type: "activa" as const,
        description: "Envenena al enemigo",
        conditions: { cosmos_min: 1 },
        effects: { status_effect: "poison", damage_per_turn: 12, duration: 4 }
      }
    ]
  }
];

export async function createBronzeKnights() {
  console.log('🥉 Creando Caballeros de Bronce...');
  
  for (const knightData of bronzeKnights) {
    try {
      // Crear carta
      const card = await Card.create(knightData.card);
      console.log(`✅ Carta creada: ${card.name}`);
      
      // Crear estadísticas de caballero
      await CardKnight.create({
        card_id: card.id,
        ...knightData.knight
      });
      
      // Crear habilidades
      for (const abilityData of knightData.abilities) {
        await CardAbility.create({
          card_id: card.id,
          ...abilityData
        });
      }
    } catch (error) {
      console.error(`❌ Error creando ${knightData.card.name}:`, error);
    }
  }
  
  console.log(`🎉 ${bronzeKnights.length} Caballeros de Bronce creados!`);
}