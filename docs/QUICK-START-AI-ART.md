# 🎨 Sistema de Generación de Imágenes de Cartas con IA

## ✅ Sistema Implementado Completamente

El sistema de generación de imágenes con IA está **100% funcional**. Permite generar automáticamente imágenes profesionales de cartas combinando:

- 🤖 **Arte generado por IA** (Stable Diffusion)
- 🎴 **Templates profesionales** con diseño por rareza
- ✨ **Efectos especiales** (foil, holográfico) para cartas épicas/legendarias
- 📊 **Estadísticas y layout** dinámicos

---

## 🚀 Inicio Rápido (5 minutos)

### 1. Instalar dependencias
```powershell
npm install
```

### 2. Configurar Replicate API (Recomendado)
```powershell
# Edita .env y agrega:
REPLICATE_API_KEY=r8_tu_token_aqui
USE_LOCAL_STABLE_DIFFUSION=false
```

**Obtén tu API key gratis en:** https://replicate.com/account/api-tokens  
**Costo:** ~$0.002 por imagen (~$0.07 para todas las 34 cartas)

### 3. Generar cartas de la base de datos
```powershell
npm run generate:cards
```

### 4. Generar imágenes con IA
```powershell
npm run generate:images
```

**¡Listo!** Las imágenes estarán en `src/assets/generated-cards/`

---

## 📋 Comandos Disponibles

### Desarrollo
```powershell
npm run dev                    # Iniciar servidor en desarrollo
```

### Generación de Datos
```powershell
npm run generate:cards         # Generar cartas en la BD
npm run generate:packs         # Generar packs/sobres
npm run generate:images        # Generar imágenes con IA
npm run generate:images:no-ai  # Generar solo con templates
npm run generate:all           # Generar TODO (cartas + packs + imágenes)
```

### Comandos Avanzados de Imágenes
```powershell
# Solo caballeros
npx ts-node src/scripts/generateCardsWithAI.ts --types caballero

# Solo raras y legendarias
npx ts-node src/scripts/generateCardsWithAI.ts --rarities rara,legendaria

# Regenerar todo (ignorar caché)
npx ts-node src/scripts/generateCardsWithAI.ts --regenerate-all

# Sin IA (solo templates)
npx ts-node src/scripts/generateCardsWithAI.ts --no-ai
```

---

## 🎨 Opciones de IA

### Opción 1: Replicate API ⭐ (Recomendado)
- ✅ Fácil de configurar (5 minutos)
- ✅ No requiere GPU
- ✅ Alta calidad (SDXL)
- 💰 ~$0.002 por imagen

**Configuración en .env:**
```env
REPLICATE_API_KEY=r8_xxxxxxxxxxxx
USE_LOCAL_STABLE_DIFFUSION=false
```

### Opción 2: Stable Diffusion Local (Gratis)
- ✅ Totalmente gratis
- ✅ Sin límites
- ❌ Requiere GPU NVIDIA (8GB+ VRAM)
- ❌ Configuración compleja (1-2 horas)

**Configuración en .env:**
```env
USE_LOCAL_STABLE_DIFFUSION=true
STABLE_DIFFUSION_URL=http://127.0.0.1:7860
```

**Ver guía completa:** [docs/ai-art-generation-guide.md](docs/ai-art-generation-guide.md)

---

## 📂 Estructura de Archivos

```
src/
├── services/
│   └── aiArtService.ts          ← Servicio de generación con IA
├── utils/
│   └── cardImageGenerator.ts    ← Compositor de cartas (arte + layout)
├── scripts/
│   └── generateCardsWithAI.ts   ← Script principal de generación
└── assets/
    ├── ai-generated-art/         ← Arte crudo de IA
    └── generated-cards/          ← Cartas finales (PNG)
```

---

## 🎭 Características por Raridad

| Raridad | Color | Marco | Efectos |
|---------|-------|-------|---------|
| Común | Gris | Plata simple | - |
| Rara | Azul | Azul metálico | - |
| Épica | Púrpura | Púrpura ornamentado | ✨ Holográfico |
| Legendaria | Dorado | Oro brillante (6px) | ✨✨ Foil intenso |

---

## 🔧 Solución Rápida de Problemas

### "REPLICATE_API_KEY no configurada"
→ Agrega tu API key en `.env`

### "Canvas instalación fallida"
```powershell
npm install --global windows-build-tools
npm install canvas
```

### "Stable Diffusion no responde"
→ Inicia `webui-user.bat` antes de generar

### Probar sin IA primero
```powershell
npm run generate:images:no-ai
```

---

## 📖 Documentación Completa

- **Guía detallada de IA:** [docs/ai-art-generation-guide.md](docs/ai-art-generation-guide.md)
- **Configuración de Stable Diffusion local:** Ver guía
- **Personalización de prompts:** `src/services/aiArtService.ts`

---

## 🎯 Ejemplo de Salida

```
[1/34] Procesando: Seiya de Pegaso
   Tipo: caballero | Rareza: rara
   🤖 Generando arte con IA...
   ✅ Arte generado con IA
   🎴 Componiendo carta final...
   ✅ Carta completada: seiya-de-pegaso.png
```

**Resultado:** Imagen PNG de 400x600px con:
- Arte del personaje generado por IA
- Layout profesional con estadísticas
- Efectos visuales según rareza
- Información de carta (nombre, costo, descripción)

---

## 💡 Próximos Pasos

Una vez que tengas las imágenes generadas:

1. ✅ Servir las imágenes desde tu API
2. ✅ Mostrarlas en el cliente Godot
3. ✅ Añadir animaciones de revelación de cartas
4. ✅ Sistema de colección visual

**¿Listo para el cliente Godot?** ¡Podemos empezar cuando quieras! 🎮
