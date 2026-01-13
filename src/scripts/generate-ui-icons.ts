// src/scripts/generate-ui-icons.ts
import https from 'https';
import fs from 'fs';
import path from 'path';

interface IconConfig {
  name: string;
  filename: string;
  prompt: string;
}

const icons: IconConfig[] = [
  {
    name: 'Biblioteca',
    filename: 'library_icon.png',
    prompt: 'Saint Seiya style icon, ancient golden scroll with cosmic energy glow, bronze metallic details, Greek mythology aesthetic, transparent background, game icon, high quality, centered composition, 256x256'
  },
  {
    name: 'Perfil',
    filename: 'profile_icon.png',
    prompt: 'Saint Seiya style icon, bronze saint helmet silhouette with golden cosmos aura, metallic armor shine, Greek mythology aesthetic, transparent background, game icon, high quality, centered composition, 256x256'
  },
  {
    name: 'Tienda',
    filename: 'shop_icon.png',
    prompt: 'Saint Seiya style icon, golden treasure chest with shining coins and cosmos energy, bronze metallic finish, Greek mythology aesthetic, transparent background, game icon, high quality, centered composition, 256x256'
  },
  {
    name: 'Partida',
    filename: 'match_icon.png',
    prompt: 'Saint Seiya style icon, crossed golden swords with cosmos explosion effect, lightning energy, bronze metallic finish, Greek mythology aesthetic, transparent background, game icon, high quality, centered composition, 256x256'
  },
  {
    name: 'Chat',
    filename: 'chat_icon.png',
    prompt: 'Saint Seiya style icon, ancient papyrus scroll with glowing golden text, cosmic particles, bronze and gold metallic finish, Greek mythology aesthetic, transparent background, game icon, high quality, centered composition, 256x256'
  }
];

async function downloadImage(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {});
      reject(err);
    });
  });
}

async function generateIcon(icon: IconConfig, outputDir: string): Promise<void> {
  console.log(`\n🎨 Generando icono: ${icon.name}`);
  console.log(`📝 Prompt: ${icon.prompt.substring(0, 80)}...`);
  
  const encodedPrompt = encodeURIComponent(icon.prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=256&height=256&nologo=true&enhance=true`;
  
  const outputPath = path.join(outputDir, icon.filename);
  
  console.log(`📥 Descargando desde Pollinations.ai...`);
  await downloadImage(imageUrl, outputPath);
  
  console.log(`✅ Icono guardado: ${icon.filename}`);
}

async function main() {
  console.log('🚀 Iniciando generación de iconos UI con Pollinations.ai\n');
  
  // Crear directorio de salida
  const outputDir = path.join(__dirname, '../../assets/ui-icons');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`📁 Directorio creado: ${outputDir}\n`);
  }
  
  // Generar cada icono
  for (const icon of icons) {
    try {
      await generateIcon(icon, outputDir);
      // Pequeño delay entre requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`❌ Error generando ${icon.name}:`, error.message);
    }
  }
  
  console.log('\n✨ Generación completada!');
  console.log(`📂 Iconos guardados en: ${outputDir}`);
  console.log('\n📋 Próximo paso: Copiar iconos a Godot');
  console.log(`   Origen: ${outputDir}`);
  console.log(`   Destino: d:\\Disco E\\Nacho\\Projects\\ccg\\assets\\ui-icons\\`);
}

main().catch(console.error);
