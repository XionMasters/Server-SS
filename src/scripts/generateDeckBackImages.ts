import dotenv from 'dotenv';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Cargar variables de entorno
dotenv.config();

/**
 * Genera 3 nuevos dorsos para mazos usando Pollinations.ai
 * (API GRATUITA, sin autenticación requerida)
 * Cada dorso tiene un estilo único
 */

interface DeckBackDesign {
  name: string;
  filename: string;
  prompt: string;
  unlock_type: 'default' | 'achievement' | 'purchase' | 'seasonal';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  description: string;
}

const DECK_BACKS_TO_GENERATE: DeckBackDesign[] = [
  {
    name: 'Dorso Cósmico',
    filename: 'cosmic.png',
    prompt: 'Abstract cosmic deck back design with galaxies, stars, and nebulas in deep blues and purples. Card game back design, fantasy style, high quality, detailed.',
    unlock_type: 'achievement',
    rarity: 'epic',
    description: 'Desbloqueable ganando 10 partidas seguidas'
  },
  {
    name: 'Dorso Celestial',
    filename: 'celestial.png',
    prompt: 'Celestial deck back with golden constellations, moons, and divine light. Saint Seiya style, elegant gold and silver colors, card game back design, mystical atmosphere.',
    unlock_type: 'purchase',
    rarity: 'rare',
    description: 'Disponible en la tienda por 500 monedas'
  },
  {
    name: 'Dorso Legendario Divino',
    filename: 'divine_legendary.png',
    prompt: 'Divine legendary deck back with angels, cosmic energy, sacred geometry. Saint Seiya mythological theme, radiant gold and platinum colors, ultra detailed, premium card back design.',
    unlock_type: 'achievement',
    rarity: 'epic',
    description: 'Desbloqueable alcanzando rango Diamante'
  },
  {
    name: 'Arma de Atenea',
    filename: 'athena_weapon.png',
    prompt: 'Saint Seiya Athena Exclamation weapon symbol, divine spear staff, Greek mythology, golden sacred light, geometric patterns, card game back design, common style.',
    unlock_type: 'seasonal',
    rarity: 'common',
    description: 'Temática del Santuario de Atenea'
  },
  {
    name: 'El Santuario',
    filename: 'sanctuary.png',
    prompt: 'Saint Seiya Sanctuary building, Greek temple architecture, marble columns, sacred grounds, mystical aura, golden light, card game back design, fantasy style.',
    unlock_type: 'seasonal',
    rarity: 'common',
    description: 'Temática del Santuario de Atenea'
  },
  {
    name: 'Caballero del Santuario',
    filename: 'sanctuary_knight.png',
    prompt: 'Saint Seiya common knight warrior in bronze armor, fighting stance, Sanctuary temple background, divine energy, mystical aura, card game back design.',
    unlock_type: 'seasonal',
    rarity: 'common',
    description: 'Temática del Santuario de Atenea'
  }
];

const HUGGINGFACE_API_KEY = process.env.HUGGINGFACE_API_KEY;
const OUTPUT_DIR = path.join(__dirname, '../../src/assets/deck-backs');

async function generateDeckBackImage(design: DeckBackDesign): Promise<Buffer> {
  console.log(`🎨 Generando: ${design.name}...`);
  
  try {
    // Usar Pollinations.ai (GRATIS, sin key)
    const pollResponse = await axios.get(
      `https://image.pollinations.ai/prompt/${encodeURIComponent(design.prompt)}?width=512&height=768&nologo=true`,
      { responseType: 'arraybuffer' }
    );

    console.log(`✅ ${design.name} generada correctamente`);
    return Buffer.from(pollResponse.data);
  } catch (error: any) {
    console.error(`⏳ Error con Pollinations, intentando Hugging Face...`);
    
    // Fallback a Hugging Face si está configurada
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    if (hfKey) {
      try {
        const hfResponse = await axios.post(
          'https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl',
          { inputs: design.prompt },
          {
            headers: { Authorization: `Bearer ${hfKey}` },
            responseType: 'arraybuffer',
            timeout: 60000
          }
        );
        console.log(`✅ ${design.name} generada con Hugging Face`);
        return Buffer.from(hfResponse.data);
      } catch (hfError: any) {
        if (hfError.response?.status === 503) {
          console.log(`⏳ Modelo cargando, esperando...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
          return generateDeckBackImage(design);
        }
        throw hfError;
      }
    }
    throw error;
  }
}

async function saveDeckBackImage(design: DeckBackDesign, buffer: Buffer): Promise<void> {
  // Crear directorio si no existe
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`📁 Directorio creado: ${OUTPUT_DIR}`);
  }

  const filepath = path.join(OUTPUT_DIR, design.filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`💾 Guardada: ${filepath}`);
}

async function generateAllDeckBacks(): Promise<void> {
  console.log('🚀 Iniciando generación de dorsos para mazos...\n');
  console.log('📋 Dorsos a generar:');
  DECK_BACKS_TO_GENERATE.forEach(design => {
    console.log(`   • ${design.name} (${design.rarity}) - ${design.unlock_type}`);
  });
  console.log('\n');

  for (const design of DECK_BACKS_TO_GENERATE) {
    try {
      const buffer = await generateDeckBackImage(design);
      await saveDeckBackImage(design, buffer);
      
      // Mostrar información
      console.log(`   Rarity: ${design.rarity}`);
      console.log(`   Type: ${design.unlock_type}`);
      console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB\n`);
    } catch (error: any) {
      console.error(`❌ Error generando ${design.name}:`, error.message);
    }
  }

  console.log('\n✅ Generación completada!');
  console.log('\nPróximos pasos:');
  console.log('1. Ejecuta: npm run seed:deck-backs');
  console.log('2. Los dorsos estarán disponibles en el juego\n');
}

generateAllDeckBacks().catch(console.error);
