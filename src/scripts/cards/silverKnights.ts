// src/scripts/cards/silverKnights.ts
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardAbility from '../../models/CardAbility';

export const silverKnights = [
  {
    card: {
      name: "Misty de Lagarto",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Caballero de plata maestro de las ilusiones.",
      faction: "Athena"
    },
    knight: {
      attack: 130,
      defense: 110,
      health: 170,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Mavros Tripas",
        type: "activa" as const,
        description: "Crea ilusiones que confunden al enemigo",
        conditions: { cosmos_min: 3 },
        effects: { status_effect: "confusion", duration: 2, dodge_chance: 50 }
      },
      {
        name: "Maestro de Ilusiones",
        type: "pasiva" as const,
        description: "20% de probabilidad de esquivar ataques",
        conditions: {},
        effects: { dodge_chance: 20 }
      }
    ]
  },
  {
    card: {
      name: "Moses de Ballena",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Caballero de plata con ataques aplastantes.",
      faction: "Athena"
    },
    knight: {
      attack: 150,
      defense: 120,
      health: 200,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Kaitos Spouting Bomber",
        type: "activa" as const,
        description: "Ataque devastador con onda expansiva",
        conditions: { cosmos_min: 4 },
        effects: { area_damage: true, damage: 120, knockback: true }
      },
      {
        name: "Resistencia Marina",
        type: "pasiva" as const,
        description: "Resistente a efectos de estado",
        conditions: {},
        effects: { status_resistance: 70 }
      }
    ]
  },
  {
    card: {
      name: "Asterion de Sabuesos",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Caballero con instintos de cazador perfectos.",
      faction: "Athena"
    },
    knight: {
      attack: 140,
      defense: 100,
      health: 160,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Million Ghost Attack",
        type: "activa" as const,
        description: "Ataques múltiples imposibles de esquivar",
        conditions: { cosmos_min: 3 },
        effects: { multi_hit: 5, damage_per_hit: 30, cannot_dodge: true }
      },
      {
        name: "Rastreo Perfecto",
        type: "pasiva" as const,
        description: "Los ataques siempre impactan",
        conditions: {},
        effects: { accuracy: 100 }
      }
    ]
  },
  {
    card: {
      name: "Babel de Centauro",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Caballero arquero con precisión mortal.",
      faction: "Athena"
    },
    knight: {
      attack: 135,
      defense: 95,
      health: 150,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Flecha de Sagitario",
        type: "activa" as const,
        description: "Disparo certero que atraviesa defensas",
        conditions: { cosmos_min: 2 },
        effects: { armor_pierce: 80, critical_chance: 30, damage: 100 }
      },
      {
        name: "Puntería Letal",
        type: "pasiva" as const,
        description: "25% de probabilidad de golpe crítico",
        conditions: {},
        effects: { critical_chance: 25, critical_multiplier: 2.0 }
      }
    ]
  },
  {
    card: {
      name: "Dante de Cerbero",
      type: "knight" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Guardián infernal con ataques de fuego.",
      faction: "Athena"
    },
    knight: {
      attack: 160,
      defense: 130,
      health: 180,
      cosmos: 5,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Howling Crush",
        type: "activa" as const,
        description: "Ataque sónico que aturde a todos los enemigos",
        conditions: { cosmos_min: 4 },
        effects: { area_damage: true, status_effect: "stunned", duration: 1, damage: 90 }
      },
      {
        name: "Guardián Infernal",
        type: "pasiva" as const,
        description: "Contraataca cuando recibe daño",
        conditions: { damage_received: true },
        effects: { counter_attack: true, counter_damage: 50 }
      }
    ]
  },
  {
    card: {
      name: "Jamian de Cuervo",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 3,
      description: "Caballero siniestro que ataca desde las sombras.",
      faction: "Athena"
    },
    knight: {
      attack: 125,
      defense: 85,
      health: 140,
      cosmos: 3,
      can_defend: true,
      defense_reduction: 0.5
    },
    abilities: [
      {
        name: "Plumas Cortantes",
        type: "activa" as const,
        description: "Múltiples proyectiles que causan sangrado",
        conditions: { cosmos_min: 2 },
        effects: { multi_projectile: 6, status_effect: "bleeding", damage_per_turn: 8, duration: 3 }
      },
      {
        name: "Vuelo Siniestro",
        type: "pasiva" as const,
        description: "Difícil de golpear por enemigos terrestres",
        conditions: { enemy_type: "ground" },
        effects: { dodge_bonus: 40 }
      }
    ]
  },
  {
    card: {
      name: "Capella de Auriga",
      type: "knight" as const,
      rarity: "rare" as const,
      cost: 4,
      description: "Caballero protector con defensas impenetrables.",
      faction: "Athena"
    },
    knight: {
      attack: 110,
      defense: 150,
      health: 190,
      cosmos: 4,
      can_defend: true,
      defense_reduction: 0.2
    },
    abilities: [
      {
        name: "Escudo Caprino",
        type: "activa" as const,
        description: "Protege a todos los aliados del próximo ataque",
        conditions: { cosmos_min: 3 },
        effects: { protect_allies: true, damage_reduction: 80, duration: 1 }
      },
      {
        name: "Defensor Nato",
        type: "pasiva" as const,
        description: "Recibe daño dirigido a aliados con menos de 30% vida",
        conditions: { ally_low_health: 30 },
        effects: { redirect_damage: true, damage_reduction: 30 }
      }
    ]
  },
  {
    card: {
      name: "Algol de Perseo",
      type: "knight" as const,
      rarity: "epic" as const,
      cost: 5,
      description: "Caballero con el poder petrificante de Medusa.",
      faction: "Athena"
    },
    knight: {
      attack: 145,
      defense: 115,
      health: 165,
      cosmos: 5,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Escudo de Medusa",
        type: "activa" as const,
        description: "Petrifica al enemigo por 2 turnos",
        conditions: { cosmos_min: 4 },
        effects: { status_effect: "petrified", duration: 2, damage: 80 }
      },
      {
        name: "Mirada Petrificante",
        type: "pasiva" as const,
        description: "10% de petrificar al atacante cuando recibe daño",
        conditions: { damage_received: true },
        effects: { petrify_chance: 10, duration: 1 }
      }
    ]
  }
];

export async function createSilverKnights() {
  console.log('🥈 Creando Caballeros de Plata...');
  
  for (const knightData of silverKnights) {
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
  
  console.log(`🎉 ${silverKnights.length} Caballeros de Plata creados!`);
}