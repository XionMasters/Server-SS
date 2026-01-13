// src/scripts/generateCardBack.ts
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const cardBackPrompt = `Saint Seiya card game back design, cosmic deep space background with blue purple and gold tones, central glowing cosmos with golden energy particles, concentric circular constellation patterns, ornate golden borders inspired by sacred cloth armor, subtle zodiac symbols in corners, mystical and epic atmosphere, symmetrical vertical design, professional card game illustration, high quality digital art, vibrant but elegant colors, no text or letters, anime trading card game back design`;

async function generateCardBack() {
  console.log('🎨 Generando imagen del dorso de carta con Pollinations AI...');
  console.log('📝 Prompt:', cardBackPrompt);

  try {
    // Usar Pollinations API directamente (gratis, sin API key)
    const encodedPrompt = encodeURIComponent(cardBackPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=768&nologo=true&enhance=true`;
    
    console.log('� Descargando imagen...');
    
    // Descargar la imagen
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60000, // 60 segundos
    });
    
    // Guardar la imagen
    const outputPath = path.join(__dirname, '../../assets/cards/card_back.png');
    const dir = path.dirname(outputPath);
    
    // Crear directorio si no existe
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Escribir archivo
    fs.writeFileSync(outputPath, response.data);
    
    console.log('✅ Imagen del dorso generada exitosamente!');
    console.log('� Ubicación:', outputPath);
    console.log('🌐 URL original:', imageUrl);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

generateCardBack();
