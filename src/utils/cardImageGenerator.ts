// src/utils/cardImageGenerator.ts
import { createCanvas, loadImage, registerFont } from 'canvas';
import fs from 'fs';
import path from 'path';

interface CardData {
  name: string;
  type: string;
  rarity: string;
  cost: number;
  attack?: number;
  defense?: number;
  health?: number;
  description: string;
  faction: string;
  artPath?: string; // Ruta a la imagen generada por IA
  constellation?: string;
  rank?: string;
}

export class CardImageGenerator {
  private canvas: any;
  private ctx: any;
  
  constructor() {
    this.canvas = createCanvas(400, 600);
    this.ctx = this.canvas.getContext('2d');
    
    // Registrar fuentes personalizadas
    try {
      registerFont(path.join(__dirname, '../assets/fonts/saintsya.ttf'), { family: 'SaintSeiya' });
    } catch (error) {
      console.log('Fuente personalizada no encontrada, usando predeterminada');
    }
  }

  async generateCardImage(cardData: CardData): Promise<Buffer> {
    // Limpiar canvas
    this.ctx.clearRect(0, 0, 400, 600);
    
    // Fondo basado en rareza
    await this.drawBackground(cardData.rarity);
    
    // Marco y bordes
    await this.drawFrame(cardData.type, cardData.rarity);
    
    // Imagen del personaje (con arte de IA si está disponible)
    await this.drawCharacterArt(cardData.name, cardData.artPath);
    
    // Efectos especiales para raras y legendarias
    if (cardData.rarity === 'legendaria' || cardData.rarity === 'epica') {
      await this.addFoilEffects(cardData.rarity);
    }
    
    // Información de la carta
    this.drawCardInfo(cardData);
    
    // Estadísticas (si es caballero)
    if (cardData.attack !== undefined) {
      this.drawStats(cardData);
    }
    
    return this.canvas.toBuffer('image/png');
  }

  private async drawBackground(rarity: string) {
    const gradients = {
      'comun': ['#E8E8E8', '#D0D0D0'],
      'rara': ['#4A90E2', '#2E5C8A'],
      'epica': ['#9B59B6', '#6A4C93'],
      'legendaria': ['#F39C12', '#D68910'],
      'divina': ['#ff2600ff', '#FFA500']
    };

    const [color1, color2] = gradients[rarity as keyof typeof gradients] || gradients.comun;
    
    const gradient = this.ctx.createLinearGradient(0, 0, 0, 600);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, 400, 600);
  }

  private async drawFrame(type: string, rarity: string) {
    // Marco exterior basado en rareza
    const frameColors: { [key: string]: string } = {
      'comun': '#8B8B8B',
      'rara': '#4A90E2',
      'epica': '#9B59B6',
      'legendaria': '#FFD700'
    };
    
    this.ctx.strokeStyle = frameColors[rarity] || '#DAA520';
    this.ctx.lineWidth = rarity === 'legendaria' ? 6 : 4;
    this.ctx.strokeRect(10, 10, 380, 580);
    
    // Marco interno
    this.ctx.strokeStyle = rarity === 'legendaria' ? '#FFA500' : '#8B4513';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(15, 15, 370, 570);
  }

  private async addFoilEffects(rarity: string) {
    // Añadir brillo holográfico para cartas épicas y legendarias
    const gradient = this.ctx.createRadialGradient(200, 300, 0, 200, 300, 300);
    
    if (rarity === 'legendaria') {
      gradient.addColorStop(0, 'rgba(255, 215, 0, 0.3)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
      gradient.addColorStop(1, 'rgba(255, 215, 0, 0.1)');
    } else {
      gradient.addColorStop(0, 'rgba(155, 89, 182, 0.2)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(155, 89, 182, 0.05)');
    }
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, 400, 600);
  }

  private async drawCharacterArt(characterName: string, artPath?: string) {
    // Área de imagen del personaje
    const artX = 30;
    const artY = 80;
    const artWidth = 340;
    const artHeight = 300;

    if (artPath && fs.existsSync(artPath)) {
      try {
        // Cargar y dibujar la imagen generada por IA
        const image = await loadImage(artPath);
        
        // Dibujar con borde redondeado
        this.ctx.save();
        this.roundRect(artX, artY, artWidth, artHeight, 10);
        this.ctx.clip();
        this.ctx.drawImage(image, artX, artY, artWidth, artHeight);
        this.ctx.restore();
        
        // Borde decorativo
        this.ctx.strokeStyle = '#DAA520';
        this.ctx.lineWidth = 3;
        this.roundRect(artX, artY, artWidth, artHeight, 10);
        this.ctx.stroke();
        
      } catch (error) {
        console.error(`Error cargando imagen: ${error}`);
        this.drawPlaceholderArt(characterName, artX, artY, artWidth, artHeight);
      }
    } else {
      // Placeholder si no hay imagen
      this.drawPlaceholderArt(characterName, artX, artY, artWidth, artHeight);
    }
  }

  private drawPlaceholderArt(characterName: string, x: number, y: number, width: number, height: number) {
    // Fondo oscuro
    this.ctx.fillStyle = '#1A1A1A';
    this.ctx.fillRect(x, y, width, height);
    
    // Texto placeholder
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = '16px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('IMAGEN DEL', x + width/2, y + height/2 - 10);
    this.ctx.fillText(characterName.toUpperCase(), x + width/2, y + height/2 + 10);
  }

  private roundRect(x: number, y: number, width: number, height: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + width - radius, y);
    this.ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.ctx.lineTo(x + width, y + height - radius);
    this.ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.ctx.lineTo(x + radius, y + height);
    this.ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  private drawCardInfo(cardData: CardData) {
    // Nombre de la carta
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(cardData.name, 200, 50);
    
    // Costo
    this.ctx.fillStyle = '#FFD700';
    this.ctx.font = 'bold 24px Arial';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(cardData.cost.toString(), 370, 50);
    
    // Tipo y rareza
    this.ctx.fillStyle = '#CCCCCC';
    this.ctx.font = '14px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`${cardData.type} - ${cardData.rarity}`, 30, 400);
    
    // Descripción
    this.ctx.fillStyle = '#FFFFFF';
    this.ctx.font = '12px Arial';
    this.wrapText(cardData.description, 30, 430, 340, 16);
  }

  private drawStats(cardData: CardData) {
    if (!cardData.attack) return;
    
    // Fondo para estadísticas
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(30, 520, 340, 60);
    
    // Ataque
    this.ctx.fillStyle = '#FF4444';
    this.ctx.font = 'bold 18px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`ATK: ${cardData.attack}`, 50, 545);
    
    // Defensa
    this.ctx.fillStyle = '#4444FF';
    this.ctx.fillText(`DEF: ${cardData.defense}`, 160, 545);
    
    // Vida
    this.ctx.fillStyle = '#44FF44';
    this.ctx.fillText(`HP: ${cardData.health}`, 270, 545);
  }

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = this.ctx.measureText(testLine);
      const testWidth = metrics.width;
      
      if (testWidth > maxWidth && n > 0) {
        this.ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    this.ctx.fillText(line, x, currentY);
  }

  async saveCardImage(cardData: CardData, outputPath: string) {
    const buffer = await this.generateCardImage(cardData);
    fs.writeFileSync(outputPath, buffer);
    console.log(`✅ Imagen generada: ${outputPath}`);
  }
}

// Script de ejemplo para generar todas las cartas
export async function generateAllCardImages() {
  const generator = new CardImageGenerator();
  
  // Crear directorio de salida
  const outputDir = path.join(__dirname, '../assets/generated-cards');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Ejemplo de uso
  const sampleCard: CardData = {
    name: "Seiya de Pegaso",
    type: "caballero",
    rarity: "rara",
    cost: 3,
    attack: 120,
    defense: 90,
    health: 150,
    description: "El caballero más determinado, protector de Athena.",
    faction: "Athena"
  };

  await generator.saveCardImage(
    sampleCard, 
    path.join(outputDir, 'seiya-pegaso.png')
  );
}

if (require.main === module) {
  generateAllCardImages().catch(console.error);
}