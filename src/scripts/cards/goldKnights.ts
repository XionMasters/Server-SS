// src/scripts/cards/goldKnights.ts
import Card from '../../models/Card';
import CardKnight from '../../models/CardKnight';
import CardAbility from '../../models/CardAbility';

export const goldKnights = [
  // Primera Casa - Aries
  {
    card: {
      name: "Mu de Aries",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "Guardián de la primera casa, maestro de la telequinesis.",
      faction: "Athena"
    },
    knight: {
      attack: 170,
      defense: 140,
      health: 220,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.2
    },
    abilities: [
      {
        name: "Muro de Cristal",
        type: "activa" as const,
        description: "Barrera que refleja todos los ataques por 2 turnos",
        conditions: { cosmos_min: 5 },
        effects: { barrier: true, reflect_damage: true, duration: 2 }
      },
      {
        name: "Reparación Telequinética",
        type: "activa" as const,
        description: "Repara armaduras y cura a todos los aliados",
        conditions: { cosmos_min: 4 },
        effects: { heal_all_allies: 60, repair_armor: true }
      },
      {
        name: "Maestro de Lemuria",
        type: "pasiva" as const,
        description: "Regenera cosmos cada turno",
        conditions: {},
        effects: { cosmos_regen: 1, trigger: "turn_start" }
      }
    ]
  },
  // Segunda Casa - Tauro
  {
    card: {
      name: "Aldebaran de Tauro",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "El muro más sólido del Santuario, guardián de Tauro.",
      faction: "Athena"
    },
    knight: {
      attack: 200,
      defense: 180,
      health: 280,
      cosmos: 6,
      can_defend: true,
      defense_reduction: 0.1
    },
    abilities: [
      {
        name: "Gran Cuerno",
        type: "activa" as const,
        description: "Ataque devastador que atraviesa múltiples enemigos",
        conditions: { cosmos_min: 5 },
        effects: { line_attack: true, armor_pierce: 100, damage: 180 }
      },
      {
        name: "Fortaleza Inquebrantable",
        type: "pasiva" as const,
        description: "Inmune a knockback y efectos de movimiento",
        conditions: {},
        effects: { knockback_immunity: true, immobilize_immunity: true }
      },
      {
        name: "Muro de Tauro",
        type: "pasiva" as const,
        description: "Reduce todo el daño recibido en 20",
        conditions: {},
        effects: { damage_reduction_flat: 20 }
      }
    ]
  },
  // Tercera Casa - Géminis
  {
    card: {
      name: "Saga de Géminis",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 8,
      description: "Ex-Patriarca con poderes dimensionales devastadores.",
      faction: "Athena"
    },
    knight: {
      attack: 190,
      defense: 120,
      health: 200,
      cosmos: 8,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Galaxian Explosion",
        type: "activa" as const,
        description: "Explosión cósmica que arrasa el campo de batalla",
        conditions: { cosmos_min: 7 },
        effects: { area_damage: true, damage: 250, cosmos_drain: 2 }
      },
      {
        name: "Another Dimension",
        type: "activa" as const,
        description: "Destierra a un enemigo a otra dimensión",
        conditions: { cosmos_min: 6 },
        effects: { banish: true, duration: 2, damage: 150 }
      },
      {
        name: "Personalidad Dual",
        type: "pasiva" as const,
        description: "50% de actuar dos veces por turno",
        conditions: {},
        effects: { double_action_chance: 50 }
      }
    ]
  },
  // Cuarta Casa - Cáncer
  {
    card: {
      name: "Máscara de la Muerte de Cáncer",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 6,
      description: "Guardián siniestro que controla las almas de los muertos.",
      faction: "Athena"
    },
    knight: {
      attack: 160,
      defense: 130,
      health: 190,
      cosmos: 6,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Ondas Infernales",
        type: "activa" as const,
        description: "Invoca almas vengativas que atacan a todos los enemigos",
        conditions: { cosmos_min: 5 },
        effects: { summon_souls: 3, soul_damage: 40, status_effect: "fear", duration: 2 }
      },
      {
        name: "Acumulación Siniestra",
        type: "pasiva" as const,
        description: "Se fortalece con cada enemigo derrotado",
        conditions: { enemy_defeated: true },
        effects: { permanent_attack_bonus: 20, permanent_defense_bonus: 10 }
      }
    ]
  },
  // Quinta Casa - Leo
  {
    card: {
      name: "Aiolia de Leo",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "El León dorado con la velocidad de la luz.",
      faction: "Athena"
    },
    knight: {
      attack: 185,
      defense: 125,
      health: 210,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Lightning Bolt",
        type: "activa" as const,
        description: "Ataque a la velocidad de la luz que siempre impacta primero",
        conditions: { cosmos_min: 4 },
        effects: { priority_attack: true, cannot_dodge: true, damage: 140, paralysis_chance: 30 }
      },
      {
        name: "Plasma Lightning Bolt",
        type: "activa" as const,
        description: "Versión mejorada que golpea a múltiples enemigos",
        conditions: { cosmos_min: 6 },
        effects: { multi_target: 3, electric_damage: 120, chain_lightning: true }
      },
      {
        name: "Velocidad Lumínica",
        type: "pasiva" as const,
        description: "Siempre ataca primero y esquiva ataques lentos",
        conditions: {},
        effects: { priority: 100, dodge_slow_attacks: true }
      }
    ]
  },
  // Sexta Casa - Virgo
  {
    card: {
      name: "Shaka de Virgo",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 8,
      description: "El hombre más cercano a Dios, maestro de las ilusiones.",
      faction: "Athena"
    },
    knight: {
      attack: 165,
      defense: 160,
      health: 240,
      cosmos: 8,
      can_defend: true,
      defense_reduction: 0.2
    },
    abilities: [
      {
        name: "Rikudō Rinne",
        type: "activa" as const,
        description: "Priva al enemigo de sus cinco sentidos",
        conditions: { cosmos_min: 6 },
        effects: { 
          remove_senses: ["sight", "hearing", "smell", "taste", "touch"], 
          duration: 3,
          damage: 100
        }
      },
      {
        name: "Tenpō Rinne",
        type: "activa" as const,
        description: "Ataque que daña el alma directamente",
        conditions: { cosmos_min: 7 },
        effects: { soul_damage: true, ignore_all_defenses: true, damage: 200 }
      },
      {
        name: "Iluminación Divina",
        type: "pasiva" as const,
        description: "Ve a través de todas las ilusiones y ataques sorpresa",
        conditions: {},
        effects: { illusion_immunity: true, sneak_attack_immunity: true, precognition: true }
      }
    ]
  },
  // Séptima Casa - Libra
  {
    card: {
      name: "Dohko de Libra",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "El Viejo Maestro, guardián de las armas sagradas.",
      faction: "Athena"
    },
    knight: {
      attack: 175,
      defense: 145,
      health: 250,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Armas de Libra",
        type: "activa" as const,
        description: "Invoca las 12 armas sagradas para un ataque devastador",
        conditions: { cosmos_min: 6 },
        effects: { weapon_barrage: 12, damage_per_weapon: 25, armor_pierce: 50 }
      },
      {
        name: "Cólera del Dragón",
        type: "activa" as const,
        description: "Poder máximo del Dragón de Libra",
        conditions: { cosmos_min: 5, health_percent_max: 50 },
        effects: { damage: 200, ignore_defense: true, area_damage: true }
      },
      {
        name: "Sabiduría Milenaria",
        type: "pasiva" as const,
        description: "Ve los puntos débiles de todos los enemigos",
        conditions: {},
        effects: { critical_chance: 40, weak_point_detection: true }
      }
    ]
  },
  // Octava Casa - Escorpio
  {
    card: {
      name: "Milo de Escorpio",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "El caballero más letal, maestro del veneno escarlata.",
      faction: "Athena"
    },
    knight: {
      attack: 180,
      defense: 135,
      health: 200,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Aguja Escarlata",
        type: "activa" as const,
        description: "15 agujas venenosas que debilitan progresivamente",
        conditions: { cosmos_min: 4 },
        effects: { 
          multi_hit: 15, 
          poison_stacks: true, 
          damage_per_hit: 20,
          final_hit_bonus: 100
        }
      },
      {
        name: "Antares",
        type: "activa" as const,
        description: "El aguijón final que mata instantáneamente si el enemigo está muy envenenado",
        conditions: { cosmos_min: 6, target_poison_stacks_min: 10 },
        effects: { instant_kill_chance: 80, damage: 250 }
      },
      {
        name: "Veneno Letal",
        type: "pasiva" as const,
        description: "Todos los ataques envenenan al enemigo",
        conditions: {},
        effects: { poison_on_hit: true, poison_damage: 15, poison_duration: 5 }
      }
    ]
  },
  // Novena Casa - Sagitario
  {
    card: {
      name: "Aiolos de Sagitario",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 8,
      description: "El caballero más noble, héroe caído del Santuario.",
      faction: "Athena"
    },
    knight: {
      attack: 195,
      defense: 140,
      health: 230,
      cosmos: 8,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Flecha Dorada",
        type: "activa" as const,
        description: "Disparo certero que nunca falla y atraviesa todo",
        conditions: { cosmos_min: 5 },
        effects: { 
          cannot_dodge: true, 
          pierce_all: true, 
          damage: 180,
          light_speed: true
        }
      },
      {
        name: "Atomic Thunder Bolt",
        type: "activa" as const,
        description: "Poder atómico concentrado en una flecha",
        conditions: { cosmos_min: 7 },
        effects: { atomic_damage: true, area_explosion: true, damage: 300 }
      },
      {
        name: "Espíritu Heroico",
        type: "pasiva" as const,
        description: "Inspira a todos los aliados, aumentando sus estadísticas",
        conditions: {},
        effects: { 
          ally_attack_bonus: 30, 
          ally_defense_bonus: 20, 
          ally_cosmos_regen: 1 
        }
      }
    ]
  },
  // Décima Casa - Capricornio
  {
    card: {
      name: "Shura de Capricornio",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "La espada más afilada del Santuario.",
      faction: "Athena"
    },
    knight: {
      attack: 190,
      defense: 130,
      health: 205,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Excalibur",
        type: "activa" as const,
        description: "La espada sagrada que corta cualquier cosa",
        conditions: { cosmos_min: 5 },
        effects: { 
          cut_anything: true, 
          ignore_all_defenses: true, 
          damage: 220,
          armor_destruction: true
        }
      },
      {
        name: "Jumping Stone",
        type: "activa" as const,
        description: "Ataque aéreo devastador desde gran altura",
        conditions: { cosmos_min: 4 },
        effects: { aerial_attack: true, damage: 160, knockdown: true }
      },
      {
        name: "Maestro de Espada",
        type: "pasiva" as const,
        description: "Todos los ataques tienen probabilidad de corte crítico",
        conditions: {},
        effects: { critical_chance: 35, critical_multiplier: 2.5 }
      }
    ]
  },
  // Décima Primera Casa - Acuario
  {
    card: {
      name: "Camus de Acuario",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "Maestro del hielo absoluto, el más frío de los caballeros.",
      faction: "Athena"
    },
    knight: {
      attack: 170,
      defense: 150,
      health: 220,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.3
    },
    abilities: [
      {
        name: "Ejecución Aurora",
        type: "activa" as const,
        description: "Congela al enemigo a -273°C, el cero absoluto",
        conditions: { cosmos_min: 6 },
        effects: { 
          absolute_zero: true, 
          freeze_duration: 3, 
          shatter_damage: 200,
          ice_prison: true
        }
      },
      {
        name: "Caja de Pandora de Hielo",
        type: "activa" as const,
        description: "Encierra al enemigo en un ataúd de hielo eterno",
        conditions: { cosmos_min: 7 },
        effects: { ice_coffin: true, duration: 5, periodic_damage: 30 }
      },
      {
        name: "Corazón de Hielo",
        type: "pasiva" as const,
        description: "Inmune a efectos de estado y emociones",
        conditions: {},
        effects: { 
          status_immunity: ["charm", "fear", "rage", "confusion"],
          emotion_immunity: true
        }
      }
    ]
  },
  // Décima Segunda Casa - Piscis
  {
    card: {
      name: "Afrodita de Piscis",
      type: "knight" as const,
      rarity: "legendary" as const,
      cost: 7,
      description: "La belleza más mortal, maestro de las rosas venenosas.",
      faction: "Athena"
    },
    knight: {
      attack: 165,
      defense: 135,
      health: 195,
      cosmos: 7,
      can_defend: true,
      defense_reduction: 0.4
    },
    abilities: [
      {
        name: "Rosas Diabólicas Reales",
        type: "activa" as const,
        description: "Rosas negras que drenan la vida del enemigo",
        conditions: { cosmos_min: 5 },
        effects: { 
          life_drain: 80, 
          heal_self: true, 
          poison_severe: true,
          beauty_charm: 20
        }
      },
      {
        name: "Rosas Piranhas",
        type: "activa" as const,
        description: "Rosas carnívoras que devoran al enemigo",
        conditions: { cosmos_min: 4 },
        effects: { 
          multi_hit: 8, 
          damage_per_hit: 25, 
          heal_per_hit: 10,
          progressive_damage: true
        }
      },
      {
        name: "Belleza Letal",
        type: "pasiva" as const,
        description: "Su belleza puede encantar enemigos masculinos",
        conditions: { enemy_gender: "male" },
        effects: { charm_chance: 25, attack_reduction: 40 }
      }
    ]
  }
];

export async function createGoldKnights() {
  console.log('🏆 Creando Caballeros Dorados...');
  
  for (const knightData of goldKnights) {
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
  
  console.log(`🎉 ${goldKnights.length} Caballeros Dorados creados!`);
}