// src/services/aiArtService.ts
import axios from 'axios';
import fs from 'fs';
import path from 'path';

interface GenerateArtOptions {
  characterName: string;
  cardType: string;
  rarity: string;
  description?: string;
  constellation?: string;
  rank?: string;
}

export class AIArtService {
  private apiKey: string;
  private apiEndpoint: string;
  private useLocalSD: boolean;

  constructor() {
    // Configuración desde variables de entorno
    this.apiKey = process.env.REPLICATE_API_KEY || process.env.HUGGINGFACE_API_KEY || '';
    this.apiEndpoint = process.env.AI_ART_ENDPOINT || 'https://api.replicate.com/v1/predictions';
    this.useLocalSD = process.env.USE_LOCAL_STABLE_DIFFUSION === 'true';
  }

  /**
   * Genera un prompt optimizado para Saint Seiya basado en los datos de la carta
   */
  private generatePrompt(options: GenerateArtOptions): string {
    const { characterName, cardType, rarity, constellation, rank } = options;

    // Base del prompt
    let prompt = '';

    if (cardType === 'caballero') {
      // Prompts específicos para caballeros con mayor fidelidad al diseño original
      const armorColor = this.getArmorColorByRank(rank || 'bronze');
      const qualityLevel = this.getQualityByRarity(rarity);
      
      // Detalles específicos de personajes conocidos para mayor fidelidad
      const characterDetails = this.getCharacterSpecificDetails(characterName, constellation);

      prompt = `Saint Seiya official anime, ${characterName}, ${rank} saint knight wearing ${armorColor} cloth armor, ${constellation} constellation motif, ${characterDetails}, 1980s anime style, Masami Kurumada original character design, Toei Animation style, Shingo Araki art direction, detailed metallic armor with constellation patterns, heroic dynamic pose, cosmic starry background with nebula, professional anime illustration, ${qualityLevel}, vibrant colors, strong linework, classic anime aesthetic`;

    } else if (cardType === 'tecnica') {
      prompt = `Saint Seiya anime screenshot, ${characterName} special attack technique, energy beam blast, cosmic power effects, speed lines, impact effects, action scene, 1980s anime style, Saint Seiya official art style, dramatic composition, glowing aura, battle effects, high quality anime illustration`;

    } else if (cardType === 'escenario') {
      prompt = `Saint Seiya anime background, ${characterName} location, ancient Greek temple architecture, marble pillars and columns, cosmic starry atmosphere, mystical sanctuary ambiance, 1980s anime background art style, detailed architectural illustration, atmospheric lighting, epic scale, professional background painting`;

    } else if (cardType === 'objeto') {
      prompt = `Saint Seiya anime, ${characterName} sacred artifact, mystical ancient object, glowing with cosmic energy, detailed item illustration, golden and bronze tones, magical aura effects, floating in space, official Saint Seiya art style, high quality game card illustration`;

    } else {
      // Genérico para otros tipos
      prompt = `Saint Seiya official anime, ${characterName}, 1980s anime style, Masami Kurumada character design, high quality illustration, detailed art, cosmic theme, classic anime aesthetic`;
    }

    return prompt;
  }

  /**
   * Obtiene detalles específicos de personajes conocidos para mayor fidelidad
   */
  private getCharacterSpecificDetails(characterName: string, constellation?: string): string {
    const name = characterName.toLowerCase();
    
    // Detalles específicos de personajes principales
    if (name.includes('seiya') || name.includes('pegaso')) {
      return 'spiky brown hair, red and white armor details, Pegasus wings motif on chest, young male hero, determined expression';
    } else if (name.includes('shiryu') || name.includes('dragón') || name.includes('dragon')) {
      return 'long black hair ponytail, green and white armor, dragon scale patterns, Asian features, calm warrior stance';
    } else if (name.includes('hyoga') || name.includes('cisne')) {
      return 'blonde hair, blue and white ice-themed armor, swan wing patterns, cool blue color scheme, elegant pose';
    } else if (name.includes('shun') || name.includes('andrómeda') || name.includes('andromeda')) {
      return 'green hair, pink and green armor, chain weapon, Andromeda cloth patterns, gentle appearance';
    } else if (name.includes('ikki') || name.includes('fénix') || name.includes('phoenix')) {
      return 'dark blue hair, purple and red Phoenix armor, phoenix wing patterns, intense expression, flame effects';
    } else if (name.includes('saga') || name.includes('géminis') || name.includes('geminis')) {
      return 'long blue hair, golden Gemini God Cloth, dual personality symbolism, majestic presence, cosmic power aura';
    } else if (name.includes('mu') || name.includes('aries')) {
      return 'lavender hair, golden Aries cloth armor, ram horn motifs, telekinetic energy effects, serene expression';
    } else if (name.includes('aiolia') || name.includes('león') || name.includes('leo')) {
      return 'orange-brown hair, golden Leo cloth, lion mane motifs, lightning bolt effects, powerful stance';
    } else if (name.includes('shaka')) {
      return 'long blonde hair, golden Virgo cloth, eyes closed meditation pose, Buddha-like aura, divine presence';
    } else if (name.includes('camus')) {
      return 'blue hair, golden Aquarius cloth armor, ice crystal effects, water bearer symbolism, cold noble expression';
    }
    
    // Genérico basado en constelación si no se reconoce el personaje
    if (constellation) {
      return `${constellation} constellation themed armor patterns, constellation star map motifs on armor`;
    }
    
    return 'detailed Saint Seiya cloth armor with constellation patterns, heroic warrior stance';
  }

  private getArmorColorByRank(rank: string): string {
    const colors: { [key: string]: string } = {
      'bronze': 'bronze metallic shining',
      'silver': 'silver metallic gleaming',
      'gold': 'golden radiant glowing',
      'god': 'divine radiant multicolor'
    };
    return colors[rank.toLowerCase()] || 'bronze';
  }

  private getQualityByRarity(rarity: string): string {
    const quality: { [key: string]: string } = {
      'comun': 'good quality, detailed',
      'rara': 'high quality, very detailed, professional',
      'epica': 'masterpiece, ultra detailed, 8k, cinematic lighting',
      'legendaria': 'masterpiece, ultra detailed, 8k, raytracing, cinematic, award winning'
    };
    return quality[rarity] || quality.comun;
  }

  /**
   * Genera arte usando Replicate API (Stable Diffusion)
   */
  async generateWithReplicate(options: GenerateArtOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error('REPLICATE_API_KEY no configurada en .env');
    }

    const prompt = this.generatePrompt(options);
    console.log(`🎨 Generando arte con IA para: ${options.characterName}`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    try {
      // Iniciar la generación
      const response = await axios.post(
        this.apiEndpoint,
        {
          version: "ac732df83cea7fff18b8472768c88ad041fa750ff7682a21affe81863cbe77e4", // SDXL
          input: {
            prompt: prompt,
            negative_prompt: "low quality, blurry, distorted, ugly, bad anatomy, watermark, text",
            width: 512,
            height: 768,
            num_inference_steps: 30,
            guidance_scale: 7.5,
            scheduler: "DPMSolverMultistep"
          }
        },
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const predictionId = response.data.id;
      
      // Esperar a que termine la generación
      const imageUrl = await this.waitForPrediction(predictionId);
      
      // Descargar la imagen
      const outputPath = await this.downloadImage(imageUrl, options.characterName);
      
      console.log(`✅ Imagen generada exitosamente: ${outputPath}`);
      return outputPath;

    } catch (error: any) {
      console.error('❌ Error generando arte con Replicate:', error.message);
      throw error;
    }
  }

  /**
   * Espera a que Replicate termine de generar la imagen
   */
  private async waitForPrediction(predictionId: string, maxAttempts = 60): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(2000); // Esperar 2 segundos

      const response = await axios.get(
        `https://api.replicate.com/v1/predictions/${predictionId}`,
        {
          headers: {
            'Authorization': `Token ${this.apiKey}`
          }
        }
      );

      const { status, output } = response.data;

      if (status === 'succeeded' && output && output.length > 0) {
        return output[0]; // URL de la imagen generada
      } else if (status === 'failed') {
        throw new Error('La generación de imagen falló');
      }

      console.log(`⏳ Esperando generación... (${i + 1}/${maxAttempts})`);
    }

    throw new Error('Timeout esperando la generación de imagen');
  }

  /**
   * Descarga la imagen desde la URL y la guarda localmente
   */
  private async downloadImage(url: string, characterName: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    
    const outputDir = path.join(__dirname, '../assets/ai-generated-art');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const fileName = characterName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    const outputPath = path.join(outputDir, `${fileName}.png`);
    fs.writeFileSync(outputPath, response.data);

    return outputPath;
  }

  /**
   * Genera arte usando Stable Diffusion local (Automatic1111 WebUI)
   */
  async generateWithLocalSD(options: GenerateArtOptions): Promise<string> {
    const localEndpoint = process.env.STABLE_DIFFUSION_URL || 'http://127.0.0.1:7860';
    const prompt = this.generatePrompt(options);

    console.log(`🎨 Generando arte con SD local para: ${options.characterName}`);

    try {
      const response = await axios.post(
        `${localEndpoint}/sdapi/v1/txt2img`,
        {
          prompt: prompt,
          negative_prompt: "low quality, blurry, distorted, ugly, bad anatomy, watermark, text, signature",
          steps: 30,
          cfg_scale: 7.5,
          width: 512,
          height: 768,
          sampler_name: "DPM++ 2M Karras"
        },
        {
          timeout: 120000 // 2 minutos timeout
        }
      );

      // La imagen viene en base64
      const base64Image = response.data.images[0];
      const imageBuffer = Buffer.from(base64Image, 'base64');

      const outputDir = path.join(__dirname, '../assets/ai-generated-art');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const fileName = options.characterName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      const outputPath = path.join(outputDir, `${fileName}.png`);
      fs.writeFileSync(outputPath, imageBuffer);

      console.log(`✅ Imagen generada con SD local: ${outputPath}`);
      return outputPath;

    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Stable Diffusion WebUI no está ejecutándose. Inicia el servidor en http://127.0.0.1:7860');
      }
      console.error('❌ Error generando arte con SD local:', error.message);
      throw error;
    }
  }

  /**
   * Genera arte usando Pollinations.ai (GRATIS, sin API key)
   */
  async generateWithPollinations(options: GenerateArtOptions): Promise<string> {
    const prompt = this.generatePrompt(options);
    console.log(`🎨 Generando arte con Pollinations.ai para: ${options.characterName}`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    try {
      // URL directa - NO necesita API key
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=768&nologo=true&enhance=true`;

      console.log(`📥 Descargando imagen desde Pollinations...`);
      const outputPath = await this.downloadImage(imageUrl, options.characterName);
      
      console.log(`✅ Imagen generada con Pollinations: ${outputPath}`);
      return outputPath;

    } catch (error: any) {
      console.error('❌ Error generando arte con Pollinations:', error.message);
      throw error;
    }
  }

  /**
   * Genera arte usando Hugging Face Inference API (GRATIS)
   */
  async generateWithHuggingFace(options: GenerateArtOptions): Promise<string> {
    const hfApiKey = process.env.HUGGINGFACE_API_KEY;
    if (!hfApiKey) {
      throw new Error('HUGGINGFACE_API_KEY no configurada en .env');
    }

    const prompt = this.generatePrompt(options);
    console.log(`🎨 Generando arte con Hugging Face para: ${options.characterName}`);
    console.log(`📝 Prompt: ${prompt.substring(0, 100)}...`);

    try {
      // Modelos que funcionan con Inference API gratuita (verificados Nov 2025)
      // NOTA: FLUX y SDXL requieren Inference Endpoints de pago
      const models = [
        'stable-diffusion-v1-5/stable-diffusion-v1-5', // SD 1.5 oficial (2.33M descargas)
        'CompVis/stable-diffusion-v1-4',               // SD 1.4 clásico
        'prompthero/openjourney'                        // Fine-tuned SD (estilo Midjourney)
      ];

      let lastError: any = null;

      for (const model of models) {
        try {
          console.log(`   🔄 Probando modelo: ${model}`);
          const modelEndpoint = `https://api-inference.huggingface.co/models/${model}`;
          
          const response = await axios.post(
            modelEndpoint,
            {
              inputs: prompt,
              parameters: {
                negative_prompt: "low quality, blurry, distorted, ugly, bad anatomy, watermark, text, signature, amateur, wrong costume, modern clothing, realistic photo, 3d render, western cartoon, wrong hair color, deformed armor, multiple characters, face only, portrait crop",
                num_inference_steps: 25,
                guidance_scale: 7.5
              }
            },
            {
              headers: {
                'Authorization': `Bearer ${hfApiKey}`,
                'Content-Type': 'application/json'
              },
              responseType: 'arraybuffer',
              timeout: 120000 // 2 minutos
            }
          );

          // La imagen viene directamente como buffer
          const outputDir = path.join(__dirname, '../assets/ai-generated-art');
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          const fileName = options.characterName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

          const outputPath = path.join(outputDir, `${fileName}.png`);
          fs.writeFileSync(outputPath, response.data);

          console.log(`✅ Imagen generada con Hugging Face (${model}): ${outputPath}`);
          return outputPath;

        } catch (modelError: any) {
          lastError = modelError;
          if (modelError.response?.status === 503) {
            console.log(`   ⏳ Modelo ${model} cargando, esperando 20s...`);
            await this.sleep(20000);
            // Reintentar el mismo modelo una vez
            try {
              const modelEndpoint = `https://api-inference.huggingface.co/models/${model}`;
              const retryResponse = await axios.post(
                modelEndpoint,
                {
                  inputs: prompt,
                  parameters: {
                    negative_prompt: "low quality, blurry, distorted, ugly, bad anatomy, watermark, text, signature, amateur, wrong costume, modern clothing, realistic photo, 3d render, western cartoon, wrong hair color, deformed armor, multiple characters, face only, portrait crop",
                    num_inference_steps: 25,
                    guidance_scale: 7.5
                  }
                },
                {
                  headers: {
                    'Authorization': `Bearer ${hfApiKey}`,
                    'Content-Type': 'application/json'
                  },
                  responseType: 'arraybuffer',
                  timeout: 120000
                }
              );

              const outputDir = path.join(__dirname, '../assets/ai-generated-art');
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }

              const fileName = options.characterName
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');

              const outputPath = path.join(outputDir, `${fileName}.png`);
              fs.writeFileSync(outputPath, retryResponse.data);

              console.log(`✅ Imagen generada con Hugging Face tras reintento (${model}): ${outputPath}`);
              return outputPath;
            } catch (retryError) {
              console.log(`   ❌ Modelo ${model} falló tras reintento, probando siguiente...`);
            }
          } else if (modelError.response?.status === 410) {
            console.log(`   ❌ Modelo ${model} no disponible (410), probando siguiente...`);
          } else {
            console.log(`   ⚠️ Error con ${model}: ${modelError.message}, probando siguiente...`);
          }
        }
      }

      // Si todos los modelos fallaron
      throw new Error(`Todos los modelos de Hugging Face fallaron. Último error: ${lastError?.message}`);

    } catch (error: any) {
      console.error('❌ Error generando arte con Hugging Face:', error.message);
      throw error;
    }
  }

  /**
   * Genera arte usando la mejor opción disponible
   */
  async generateArt(options: GenerateArtOptions): Promise<string> {
    // Prioridad: Pollinations (gratis, sin key, siempre funciona) > HuggingFace > Replicate
    const hfApiKey = process.env.HUGGINGFACE_API_KEY;
    const usePollinations = process.env.USE_POLLINATIONS === 'true' || true; // FORZADO: siempre intentar Pollinations primero
    const useHuggingFace = process.env.USE_HUGGINGFACE === 'true' || (!this.useLocalSD && hfApiKey && !process.env.REPLICATE_API_KEY);
    
    // Intentar múltiples opciones gratuitas con fallback
    const freeOptions = [];
    
    // PRIMERO: Pollinations (SIN API KEY, siempre disponible)
    if (usePollinations) {
      freeOptions.push({ name: 'Pollinations', fn: () => this.generateWithPollinations(options) });
    }
    
    // SEGUNDO: Hugging Face (requiere API key, modelos pueden fallar)
    if (useHuggingFace && hfApiKey) {
      freeOptions.push({ name: 'Hugging Face', fn: () => this.generateWithHuggingFace(options) });
    }

    // Intentar opciones gratuitas primero
    for (const option of freeOptions) {
      try {
        console.log(`🔄 Intentando ${option.name}...`);
        return await option.fn();
      } catch (error: any) {
        console.log(`⚠️ ${option.name} falló: ${error.message}`);
        if (freeOptions.indexOf(option) < freeOptions.length - 1) {
          console.log(`🔄 Probando siguiente opción gratuita...`);
        }
      }
    }

    // Fallback a opciones de pago/local si todas las gratuitas fallan
    if (this.useLocalSD) {
      return this.generateWithLocalSD(options);
    } else if (this.apiKey) {
      return this.generateWithReplicate(options);
    } else {
      throw new Error('No hay configuración de IA disponible y todas las opciones gratuitas fallaron. Configura HUGGINGFACE_API_KEY o habilita USE_POLLINATIONS en .env');
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default new AIArtService();
