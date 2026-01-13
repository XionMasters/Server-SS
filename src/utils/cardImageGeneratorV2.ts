// src/utils/cardImageGeneratorV2.ts
// Generador de cartas estilo Blood Crisis TCG
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
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
  artPath?: string;
  constellation?: string;
  rank?: string;
}

export class CardImageGeneratorV2 {
  private canvas: any;
  private ctx: CanvasRenderingContext2D;
  private width = 400;
  private height = 560;
  
  constructor() {
    this.canvas = createCanvas(this.width, this.height);
    this.ctx = this.canvas.getContext('2d');
  }

  async generateCardImage(cardData: CardData): Promise<Buffer> {
    // 1. Fondo principal con textura
    await this.drawMainBackground(cardData.rarity);
    
    // 2. Marco exterior con efecto metálico
    this.drawMetallicFrame(cardData.rarity);
    
    // 3. Barra superior con nombre
    this.drawNameHeader(cardData.name, cardData.rarity);
    
    // 4. Imagen del personaje
    await this.drawCharacterArt(cardData.artPath);
    
    // 5. Stats circulares (PV, CE, ataque, defensa)
    this.drawCircularStats(cardData);
    
    // 6. Barra de tipo/rango
    this.drawTypeBar(cardData);
    
    // 7. Sección de habilidades
    this.drawAbilitiesSection(cardData);
    
    return this.canvas.toBuffer('image/png');
  }

  private async drawMainBackground(rarity: string) {
    const colors = {
      'comun': { start: '#E8E8E8', end: '#C0C0C0' },
      'rara': { start: '#F0F0F0', end: '#D8D8D8' },
      'epica': { start: '#F5F0FF', end: '#E0D8F0' },
      'legendaria': { start: '#FFFAF0', end: '#F0E8D0' }
    };

    const { start, end } = colors[rarity as keyof typeof colors] || colors.comun;
    
    const gradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, start);
    gradient.addColorStop(1, end);
    
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  private drawMetallicFrame(rarity: string) {
    const frameColors = {
      'comun': '#C0C0C0',      // Plateado
      'rara': '#C0C0C0',       // Plateado
      'epica': '#B8860B',      // Dorado oscuro
      'legendaria': '#FFD700'  // Dorado brillante
    };

    const color = frameColors[rarity as keyof typeof frameColors] || '#C0C0C0';
    
    // Marco exterior principal
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = 8;
    this.ctx.strokeRect(4, 4, this.width - 8, this.height - 8);
    
    // Sombra interior del marco
    this.ctx.strokeStyle = this.darkenColor(color, 0.3);
    this.ctx.lineWidth = 3;
    this.ctx.strokeRect(10, 10, this.width - 20, this.height - 20);
    
    // Highlight del marco
    this.ctx.strokeStyle = this.lightenColor(color, 0.4);
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(6, 6, this.width - 12, this.height - 12);
  }

  private drawNameHeader(name: string, rarity: string) {
    const headerY = 20;
    const headerHeight = 35;
    
    // Fondo metalizado del header
    const gradient = this.ctx.createLinearGradient(0, headerY, 0, headerY + headerHeight);
    if (rarity === 'legendaria' || rarity === 'epica') {
      gradient.addColorStop(0, '#F5E6D3');
      gradient.addColorStop(0.5, '#E8D7C0');
      gradient.addColorStop(1, '#D4C4AA');
    } else {
      gradient.addColorStop(0, '#E8E8E8');
      gradient.addColorStop(0.5, '#D0D0D0');
      gradient.addColorStop(1, '#B8B8B8');
    }
    
    this.ctx.fillStyle = gradient;
    this.roundRect(20, headerY, this.width - 40, headerHeight, 5);
    this.ctx.fill();
    
    // Borde del header
    this.ctx.strokeStyle = '#8B8B8B';
    this.ctx.lineWidth = 2;
    this.roundRect(20, headerY, this.width - 40, headerHeight, 5);
    this.ctx.stroke();
    
    // Texto del nombre
    this.ctx.fillStyle = '#2C2C2C';
    this.ctx.font = 'bold 20px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(name, this.width / 2, headerY + 25);
  }

  private async drawCharacterArt(artPath?: string) {
    const artX = 25;
    const artY = 65;
    const artWidth = this.width - 50;
    const artHeight = 240;
    
    // Marco para la imagen
    this.ctx.fillStyle = '#2C2C2C';
    this.roundRect(artX - 2, artY - 2, artWidth + 4, artHeight + 4, 8);
    this.ctx.fill();
    
    // Fondo por si no hay imagen
    this.ctx.fillStyle = '#4A4A4A';
    this.roundRect(artX, artY, artWidth, artHeight, 8);
    this.ctx.fill();
    
    // Cargar y dibujar imagen si existe
    if (artPath && fs.existsSync(artPath)) {
      try {
        const img = await loadImage(artPath);
        this.ctx.save();
        
        // Clip para esquinas redondeadas
        this.roundRect(artX, artY, artWidth, artHeight, 8);
        this.ctx.clip();
        
        // Calcular dimensiones - priorizar mostrar la parte superior (cabeza)
        const scale = Math.max(artWidth / img.width, artHeight / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        
        // Centrar horizontalmente, pero alinear hacia arriba verticalmente
        const offsetX = artX + (artWidth - scaledWidth) / 2;
        const offsetY = artY - (scaledHeight - artHeight) * 0.2; // Mostrar más de la parte superior
        
        this.ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);
        this.ctx.restore();
      } catch (error) {
        console.log('Error cargando imagen:', error);
      }
    }
  }

  private drawCircularStats(cardData: CardData) {
    const stats = [
      { label: 'PV', value: cardData.health || 0, y: 85 },
      { label: 'CE', value: cardData.cost || 0, y: 145 },
      { label: '', value: cardData.attack || 0, y: 205 },
      { label: '', value: cardData.defense || 0, y: 265 }
    ];
    
    const circleX = 45;
    const circleRadius = 18;
    
    stats.forEach(stat => {
      // Círculo exterior (borde oscuro)
      this.ctx.fillStyle = '#3C3C3C';
      this.ctx.beginPath();
      this.ctx.arc(circleX, stat.y, circleRadius + 2, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Círculo interior (fondo claro)
      this.ctx.fillStyle = '#E8E8E8';
      this.ctx.beginPath();
      this.ctx.arc(circleX, stat.y, circleRadius, 0, Math.PI * 2);
      this.ctx.fill();
      
      // Label superior
      if (stat.label) {
        this.ctx.fillStyle = '#2C2C2C';
        this.ctx.font = 'bold 9px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(stat.label, circleX, stat.y - 3);
      }
      
      // Valor
      this.ctx.fillStyle = '#2C2C2C';
      this.ctx.font = 'bold 16px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(String(stat.value).padStart(2, '0'), circleX, stat.y + (stat.label ? 10 : 6));
    });
  }

  private drawTypeBar(cardData: CardData) {
    const barY = 310;
    const barHeight = 25;
    
    // Fondo oscuro de la barra
    this.ctx.fillStyle = '#2C2C2C';
    this.roundRect(25, barY, this.width - 50, barHeight, 5);
    this.ctx.fill();
    
    // Texto del tipo/rango
    this.ctx.fillStyle = '#F0F0F0';
    this.ctx.font = 'bold 14px Arial';
    this.ctx.textAlign = 'center';
    
    let rankText = cardData.rank || 'Caballero';
    if (cardData.rarity === 'legendaria') rankText += ' de Oro';
    else if (cardData.rarity === 'epica') rankText += ' de Plata';
    else rankText += ' de Bronce';
    
    this.ctx.fillText(rankText, this.width / 2, barY + 17);
  }

  private drawAbilitiesSection(cardData: CardData) {
    const sectionY = 345;
    const sectionHeight = 165;
    
    // Fondo de la sección
    const gradient = this.ctx.createLinearGradient(0, sectionY, 0, sectionY + sectionHeight);
    gradient.addColorStop(0, '#F8F8F8');
    gradient.addColorStop(1, '#E8E8E8');
    
    this.ctx.fillStyle = gradient;
    this.roundRect(25, sectionY, this.width - 50, sectionHeight, 8);
    this.ctx.fill();
    
    // Borde
    this.ctx.strokeStyle = '#8B8B8B';
    this.ctx.lineWidth = 1;
    this.roundRect(25, sectionY, this.width - 50, sectionHeight, 8);
    this.ctx.stroke();
    
    // Header "Habilidades"
    this.ctx.fillStyle = '#2C2C2C';
    this.ctx.font = 'bold 12px Arial';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('Habilidades', 35, sectionY + 18);
    
    // Línea separadora
    this.ctx.strokeStyle = '#B8B8B8';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(35, sectionY + 25);
    this.ctx.lineTo(this.width - 35, sectionY + 25);
    this.ctx.stroke();
    
    // Descripción (texto envuelto)
    this.ctx.fillStyle = '#3C3C3C';
    this.ctx.font = '10px Arial';
    this.ctx.textAlign = 'left';
    
    const description = cardData.description || 'Sin descripción';
    this.wrapText(description, 35, sectionY + 40, this.width - 70, 13);
  }

  private drawWatermark() {
    this.ctx.save();
    this.ctx.translate(this.width / 2, this.height / 2);
    this.ctx.rotate(-Math.PI / 6); // -30 grados
    
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    this.ctx.font = 'bold 48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('SSTCGO', 0, 0);
    
    this.ctx.restore();
  }

  // Utilidades
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

  private wrapText(text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
    const words = text.split(' ');
    let line = '';
    let currentY = y;

    for (let i = 0; i < words.length; i++) {
      const testLine = line + words[i] + ' ';
      const metrics = this.ctx.measureText(testLine);
      
      if (metrics.width > maxWidth && i > 0) {
        this.ctx.fillText(line, x, currentY);
        line = words[i] + ' ';
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    this.ctx.fillText(line, x, currentY);
  }

  private darkenColor(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.max(0, parseInt(hex.substr(0, 2), 16) * (1 - amount));
    const g = Math.max(0, parseInt(hex.substr(2, 2), 16) * (1 - amount));
    const b = Math.max(0, parseInt(hex.substr(4, 2), 16) * (1 - amount));
    return `rgb(${r}, ${g}, ${b})`;
  }

  private lightenColor(color: string, amount: number): string {
    const hex = color.replace('#', '');
    const r = Math.min(255, parseInt(hex.substr(0, 2), 16) + (255 * amount));
    const g = Math.min(255, parseInt(hex.substr(2, 2), 16) + (255 * amount));
    const b = Math.min(255, parseInt(hex.substr(4, 2), 16) + (255 * amount));
    return `rgb(${r}, ${g}, ${b})`;
  }
}
