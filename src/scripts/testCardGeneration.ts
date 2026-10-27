// src/scripts/testCardGeneration.ts
import { CardImageGenerator } from '../infrastructure/assets/cardImageGenerator';
import path from 'path';

async function testCardGeneration() {
  console.log('🧪 Probando generación de cartas sin IA...\n');
  
  const generator = new CardImageGenerator();
  const outputDir = path.join(__dirname, '../assets/generated-cards');

  // Test 1: Caballero común
  console.log('1️⃣ Generando caballero común...');
  await generator.saveCardImage(
    {
      name: "Caballero de Prueba",
      type: "caballero",
      rarity: "comun",
      cost: 2,
      attack: 80,
      defense: 60,
      health: 100,
      description: "Un caballero común de prueba para verificar el sistema.",
      faction: "Athena"
    },
    path.join(outputDir, 'test-common.png')
  );

  // Test 2: Técnica rara
  console.log('2️⃣ Generando técnica rara...');
  await generator.saveCardImage(
    {
      name: "Meteoros de Pegaso",
      type: "tecnica",
      rarity: "rara",
      cost: 3,
      description: "Ataque rápido de Seiya que causa 120 de daño al oponente.",
      faction: "Athena"
    },
    path.join(outputDir, 'test-rare.png')
  );

  // Test 3: Escenario épico
  console.log('3️⃣ Generando escenario épico...');
  await generator.saveCardImage(
    {
      name: "Santuario de Athena",
      type: "escenario",
      rarity: "epica",
      cost: 4,
      description: "Todos los caballeros de Athena ganan +2 de defensa y +1 de ataque.",
      faction: "Athena"
    },
    path.join(outputDir, 'test-epic.png')
  );

  // Test 4: Caballero legendario
  console.log('4️⃣ Generando caballero legendario...');
  await generator.saveCardImage(
    {
      name: "Saga de Géminis",
      type: "caballero",
      rarity: "legendaria",
      cost: 7,
      attack: 180,
      defense: 160,
      health: 250,
      description: "Santo dorado de Géminis. Puede atacar dos veces por turno.",
      faction: "Athena",
      constellation: "Géminis",
      rank: "gold"
    },
    path.join(outputDir, 'test-legendary.png')
  );

  console.log('\n✅ ¡Generación de prueba completada!');
  console.log(`📂 Revisa las imágenes en: ${outputDir}\n`);
  console.log('🎴 Cartas generadas:');
  console.log('   • test-common.png     (Común - Gris)');
  console.log('   • test-rare.png       (Rara - Azul)');
  console.log('   • test-epic.png       (Épica - Púrpura + Holográfico)');
  console.log('   • test-legendary.png  (Legendaria - Dorado + Foil)\n');
}

if (require.main === module) {
  testCardGeneration().catch(console.error);
}

export default testCardGeneration;
