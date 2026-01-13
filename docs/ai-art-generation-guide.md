# 🎨 Guía Completa: Generación de Imágenes de Cartas con IA

## 📋 Tabla de Contenidos
1. [Descripción General](#descripción-general)
2. [Instalación de Dependencias](#instalación-de-dependencias)
3. [Configuración de IA](#configuración-de-ia)
4. [Uso del Sistema](#uso-del-sistema)
5. [Opciones Avanzadas](#opciones-avanzadas)

---

## 🎯 Descripción General

Este sistema genera automáticamente imágenes de cartas combinando:
- **Arte generado por IA** (Stable Diffusion via Replicate o local)
- **Templates de carta** con diseño profesional
- **Efectos especiales** para raridades (foil, holográfico)

### Arquitectura del Sistema

```
┌─────────────────────┐
│   Base de Datos     │ ← Información de cartas
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Art Service     │ ← Genera arte del personaje
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Card Image          │ ← Compone carta final
│ Generator           │    (arte + layout + stats)
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Imagen PNG Final    │
└─────────────────────┘
```

---

## 📦 Instalación de Dependencias

```powershell
# Instalar dependencias de generación de imágenes
npm install canvas sharp axios

# Instalar tipos TypeScript
npm install --save-dev @types/node
```

### Solución de Problemas de Canvas (Windows)

Si `canvas` falla al instalar:

```powershell
# Opción 1: Instalar visual studio build tools
npm install --global windows-build-tools

# Opción 2: Usar versión pre-compilada
npm install canvas --canvas_binary_host_mirror=https://github.com/Automattic/node-canvas/releases/download
```

---

## 🤖 Configuración de IA

### Opción 1: Replicate API (RECOMENDADA) ⭐

**Ventajas:**
- ✅ No requiere instalación local
- ✅ Configuración en 5 minutos
- ✅ GPU en la nube (rápido)
- ✅ Modelo SDXL de alta calidad
- 💰 Pago por uso (~$0.002 por imagen)

**Pasos:**

1. **Crear cuenta en Replicate:**
   - Ve a https://replicate.com
   - Regístrate con GitHub o email
   - Verifica tu email

2. **Obtener API Key:**
   - Ve a https://replicate.com/account/api-tokens
   - Clic en "Create token"
   - Copia el token (empieza con `r8_...`)

3. **Configurar .env:**
   ```env
   REPLICATE_API_KEY=r8_TuTokenAquiDeReplicate
   USE_LOCAL_STABLE_DIFFUSION=false
   ```

4. **Agregar crédito:**
   - Ve a https://replicate.com/account/billing
   - Agrega $5-10 USD (alcanza para ~2500 imágenes)

**Costos estimados:**
- 1 imagen: ~$0.002 USD
- 34 cartas (tu colección actual): ~$0.07 USD
- 100 cartas: ~$0.20 USD

---

### Opción 2: Stable Diffusion Local (GRATIS)

**Ventajas:**
- ✅ Totalmente gratis
- ✅ Control total del modelo
- ✅ Sin límites de generación
- ❌ Requiere GPU potente (NVIDIA 8GB+ VRAM recomendado)
- ❌ Configuración más compleja

**Requisitos:**
- Windows 10/11
- GPU NVIDIA con 6GB+ VRAM (8GB+ recomendado)
- Python 3.10
- Git

**Instalación Paso a Paso:**

#### 1. Instalar Python 3.10
```powershell
# Descargar de: https://www.python.org/downloads/
# ⚠️ IMPORTANTE: Marcar "Add Python to PATH" durante instalación
```

#### 2. Clonar Stable Diffusion WebUI
```powershell
cd D:\
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui
```

#### 3. Descargar modelo SDXL
```powershell
# Opción A: Modelo SDXL (Mejor calidad)
# Descargar de: https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
# Mover archivo .safetensors a: stable-diffusion-webui\models\Stable-diffusion\

# Opción B: Modelo SD 1.5 (Más rápido, menos VRAM)
# Descargar de: https://huggingface.co/runwayml/stable-diffusion-v1-5
```

#### 4. Iniciar WebUI
```powershell
# Primera vez (instala dependencias automáticamente)
.\webui-user.bat

# Espera 5-10 minutos la primera vez
# Se abrirá en: http://127.0.0.1:7860
```

#### 5. Configurar .env
```env
USE_LOCAL_STABLE_DIFFUSION=true
STABLE_DIFFUSION_URL=http://127.0.0.1:7860
```

#### 6. Habilitar API en WebUI
```powershell
# Editar: webui-user.bat
# Cambiar línea:
set COMMANDLINE_ARGS=--api

# Guardar y reiniciar webui-user.bat
```

---

## 🚀 Uso del Sistema

### Comando Básico: Generar Todas las Cartas

```powershell
# Con arte de IA (Replicate o SD Local)
npx ts-node src/scripts/generateCardsWithAI.ts

# Sin IA (solo templates)
npx ts-node src/scripts/generateCardsWithAI.ts --no-ai
```

### Comandos Avanzados

```powershell
# Regenerar todo (incluso cartas que ya tienen arte)
npx ts-node src/scripts/generateCardsWithAI.ts --regenerate-all

# Solo caballeros
npx ts-node src/scripts/generateCardsWithAI.ts --types caballero

# Solo cartas raras y legendarias
npx ts-node src/scripts/generateCardsWithAI.ts --rarities rara,legendaria

# Combinación: Solo caballeros legendarios, regenerar todo
npx ts-node src/scripts/generateCardsWithAI.ts --types caballero --rarities legendaria --regenerate-all
```

### Proceso de Generación

```
[1/34] Procesando: Seiya de Pegaso
   Tipo: caballero | Rareza: rara
   🤖 Generando arte con IA...
   📝 Prompt: Saint Seiya character, Seiya de Pegaso, bronze saint...
   ⏳ Esperando generación... (1/60)
   ⏳ Esperando generación... (2/60)
   ✅ Arte generado con IA
   🎴 Componiendo carta final...
   ✅ Carta completada: seiya-de-pegaso.png

[2/34] Procesando: Shiryu de Dragón
   ...
```

---

## 🎨 Personalización de Prompts

Edita `src/services/aiArtService.ts` para personalizar los prompts:

```typescript
// Caballeros
prompt = `Saint Seiya character, ${characterName}, ${rank} saint, 
  ${constellation} constellation, ${armorColor} armor, 
  epic pose, cosmic background with stars and nebulae, 
  anime style, highly detailed armor, glowing cosmic energy, 
  dynamic composition, masterpiece, Masami Kurumada art style`;

// Técnicas
prompt = `Saint Seiya technique attack, ${characterName}, 
  energy blast, cosmic power, dramatic action scene, 
  anime style, glowing effects, speed lines, impact effect`;

// Escenarios
prompt = `Saint Seiya location, ${characterName}, 
  ancient greek temple, cosmic atmosphere, 
  pillars and architecture, starry sky, mystical ambiance`;
```

---

## 📊 Estructura de Archivos Generados

```
Server-SS/
└── src/
    └── assets/
        ├── ai-generated-art/          ← Arte crudo generado por IA
        │   ├── seiya-de-pegaso.png
        │   ├── shiryu-de-dragon.png
        │   └── ...
        │
        └── generated-cards/            ← Cartas finales (arte + layout)
            ├── seiya-de-pegaso.png
            ├── shiryu-de-dragon.png
            └── ...
```

---

## 🎭 Efectos Especiales por Raridad

### Común
- Fondo: Gris degradado
- Marco: Plata simple
- Sin efectos especiales

### Rara
- Fondo: Azul brillante degradado
- Marco: Azul metálico
- Sin efectos especiales

### Épica
- Fondo: Púrpura místico degradado
- Marco: Púrpura ornamentado
- ✨ Efecto holográfico sutil

### Legendaria
- Fondo: Dorado radiante degradado
- Marco: Oro brillante (6px de grosor)
- ✨✨ Efecto foil intenso
- 🌟 Brillo radial

---

## 🔧 Solución de Problemas

### Error: "REPLICATE_API_KEY no configurada"
```
❌ Error: REPLICATE_API_KEY no configurada en .env
```
**Solución:** Agrega tu API key en `.env`

### Error: "Stable Diffusion WebUI no está ejecutándose"
```
❌ Error: ECONNREFUSED http://127.0.0.1:7860
```
**Solución:** Inicia `webui-user.bat` antes de ejecutar el script

### Error: "Canvas instalación fallida"
```powershell
# Windows: Instalar build tools
npm install --global windows-build-tools

# Mac: Instalar dependencies
brew install pkg-config cairo pango libpng jpeg giflib librsvg

# Linux: Instalar dependencies
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

### Las imágenes se ven mal
- Verifica que el modelo SDXL esté correctamente descargado
- Aumenta `num_inference_steps` a 50+ en `aiArtService.ts`
- Prueba con diferentes `guidance_scale` (7-12)

---

## 📈 Comparación de Opciones

| Característica | Replicate API | SD Local | Solo Templates |
|---------------|---------------|----------|----------------|
| **Costo** | $0.002/img | Gratis | Gratis |
| **Calidad** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Velocidad** | 10-30s/img | 30-120s/img | <1s/img |
| **GPU requerida** | No | Sí (8GB+) | No |
| **Configuración** | 5 min | 1-2 horas | Ya listo |
| **Control** | Medio | Alto | Bajo |

---

## 🎯 Recomendación Final

### Para Empezar Rápido:
1. ✅ Usa **Replicate API** (agrega $5 USD)
2. ✅ Genera tus 34 cartas (~$0.07)
3. ✅ Evalúa resultados
4. ✅ Si te gusta, continúa con Replicate
5. ✅ Si quieres gratis, migra a SD Local después

### Para Producción:
- **Pocas cartas (<100):** Replicate API
- **Muchas cartas (>100):** SD Local
- **Sin GPU potente:** Replicate API
- **Presupuesto cero:** SD Local (si tienes GPU)

---

## 📞 Soporte

Si tienes problemas:
1. Verifica errores en la consola
2. Revisa que `.env` esté configurado correctamente
3. Prueba primero con `--no-ai` para verificar que el sistema base funcione
4. Genera solo 1 carta de prueba: `--types caballero --rarities comun`

¡Buena suerte generando tus cartas! 🎴✨
