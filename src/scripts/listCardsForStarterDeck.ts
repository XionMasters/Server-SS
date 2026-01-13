// src/scripts/listCardsForStarterDeck.ts
/**
 * Script para listar cartas disponibles y generar configuración del deck inicial
 * Uso: npx ts-node src/scripts/listCardsForStarterDeck.ts
 */

import { sequelize } from '../config/database';
import Card from '../models/Card';

interface CardSummary {
  id: string;
  name: string;
  type: string;
  rarity: string;
  cost: number;
  element: string | null;
  faction: string | null;
}

const listCardsForStarterDeck = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexión a base de datos exitosa\n');

    // Obtener cartas comunes y raras
    const cards = await Card.findAll({
      where: {
        rarity: ['comun', 'rara']
      },
      order: [
        ['type', 'ASC'],
        ['rarity', 'ASC'],
        ['cost', 'ASC'],
        ['name', 'ASC']
      ],
      attributes: ['id', 'name', 'type', 'rarity', 'cost', 'element', 'faction']
    });

    if (cards.length === 0) {
      console.log('❌ No se encontraron cartas comunes o raras en la base de datos.');
      console.log('   Ejecuta primero el script de generación de cartas.');
      process.exit(1);
    }

    console.log(`📊 Total de cartas comunes/raras encontradas: ${cards.length}\n`);
    console.log('═'.repeat(120));

    // Agrupar por tipo
    const cardsByType = cards.reduce((acc, card) => {
      const cardData = card.toJSON() as CardSummary;
      if (!acc[cardData.type]) {
        acc[cardData.type] = [];
      }
      acc[cardData.type].push(cardData);
      return acc;
    }, {} as Record<string, CardSummary[]>);

    // Mostrar cartas por tipo
    const typeNames: Record<string, string> = {
      'caballero': '⚔️  CABALLEROS',
      'tecnica': '🔥 TÉCNICAS',
      'objeto': '🎁 OBJETOS',
      'ayudante': '👥 AYUDANTES',
      'ocasion': '⭐ OCASIONES',
      'escenario': '🏛️  ESCENARIOS'
    };

    Object.entries(cardsByType).forEach(([type, typeCards]) => {
      console.log(`\n${typeNames[type] || type.toUpperCase()} (${typeCards.length} cartas)`);
      console.log('─'.repeat(120));
      
      typeCards.forEach((card) => {
        const rarityEmoji = card.rarity === 'comun' ? '⚪' : '🔵';
        const element = card.element ? `[${card.element}]` : '';
        const faction = card.faction ? `{${card.faction}}` : '';
        
        console.log(
          `${rarityEmoji} ${card.name.padEnd(40)} | ` +
          `Cost: ${String(card.cost).padStart(2)} | ` +
          `${element.padEnd(8)} ${faction.padEnd(15)} | ` +
          `ID: ${card.id}`
        );
      });
    });

    console.log('\n' + '═'.repeat(120));
    console.log('\n📝 RECOMENDACIONES PARA EL DECK INICIAL:\n');
    console.log('1. Selecciona un total de 40 cartas');
    console.log('2. Distribución recomendada:');
    console.log('   - 20 Caballeros (mezcla de comunes y raros)');
    console.log('   - 10 Técnicas (principalmente raras para remoción/buff)');
    console.log('   - 6 Objetos (equipamiento y utilidades)');
    console.log('   - 2 Ayudantes (draw/search)');
    console.log('   - 2 Ocasiones (eventos clave)');
    console.log('3. Usa 3 copias de cartas core, 2 de soporte, 1 de situacionales');
    console.log('4. Balancea la curva de costos (más cartas de costo 1-3)');
    console.log('5. Incluye remoción, draw, y win conditions\n');

    // Generar template de configuración
    console.log('═'.repeat(120));
    console.log('\n📋 TEMPLATE DE CONFIGURACIÓN:\n');
    console.log('Copia los IDs de las cartas que quieras y reemplaza en src/config/starter-deck.config.ts\n');
    console.log('Ejemplo:');
    console.log('{ card_id: "id-de-la-carta", quantity: 3 }, // 3 copias');
    console.log('{ card_id: "id-de-la-carta", quantity: 2 }, // 2 copias');
    console.log('{ card_id: "id-de-la-carta", quantity: 1 }, // 1 copia\n');

    // Generar sugerencia automática balanceada
    console.log('═'.repeat(120));
    console.log('\n🤖 SUGERENCIA AUTOMÁTICA (edita según tu criterio):\n');
    
    const suggestions: string[] = [];
    let totalSuggested = 0;

    // Caballeros comunes (12 cartas = 4 tipos × 3 copias)
    const commonKnights = cardsByType['caballero']?.filter(c => c.rarity === 'comun').slice(0, 4) || [];
    commonKnights.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 3 }, // ${card.name} (Común)`);
      totalSuggested += 3;
    });

    // Caballeros raros (8 cartas = 4 tipos × 2 copias)
    const rareKnights = cardsByType['caballero']?.filter(c => c.rarity === 'rara').slice(0, 4) || [];
    rareKnights.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 2 }, // ${card.name} (Raro)`);
      totalSuggested += 2;
    });

    // Técnicas raras (10 cartas = 5 tipos × 2 copias)
    const rareTechs = cardsByType['tecnica']?.filter(c => c.rarity === 'rara').slice(0, 5) || [];
    rareTechs.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 2 }, // ${card.name} (Técnica Rara)`);
      totalSuggested += 2;
    });

    // Objetos (6 cartas = 3 tipos × 2 copias)
    const objects = cardsByType['objeto']?.slice(0, 3) || [];
    objects.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 2 }, // ${card.name} (Objeto)`);
      totalSuggested += 2;
    });

    // Ayudantes (2 cartas = 1 tipo × 2 copias)
    const helpers = cardsByType['ayudante']?.slice(0, 1) || [];
    helpers.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 2 }, // ${card.name} (Ayudante)`);
      totalSuggested += 2;
    });

    // Ocasiones (2 cartas = 1 tipo × 2 copias)
    const occasions = cardsByType['ocasion']?.slice(0, 1) || [];
    occasions.forEach(card => {
      suggestions.push(`  { card_id: '${card.id}', quantity: 2 }, // ${card.name} (Ocasión)`);
      totalSuggested += 2;
    });

    console.log('export const STARTER_DECK_CARDS: StarterDeckCard[] = [');
    suggestions.forEach(line => console.log(line));
    console.log('];\n');
    console.log(`Total de cartas sugeridas: ${totalSuggested}/40`);
    
    if (totalSuggested < 40) {
      console.log(`⚠️  Faltan ${40 - totalSuggested} cartas. Agrega más cartas según tu criterio.`);
    }

    console.log('\n✅ Script completado. Copia el template y edita src/config/starter-deck.config.ts\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

// Ejecutar
if (require.main === module) {
  listCardsForStarterDeck();
}

export default listCardsForStarterDeck;
