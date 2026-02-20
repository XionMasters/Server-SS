# 🎴 Generación de Dorsos para Mazos

## Descripción

Este sistema permite generar automáticamente nuevas imágenes de dorsos (card backs) para mazos usando IA, y organizarlos en categorías según cómo los jugadores pueden obtenerlos.

## Estructura de Dorsos

Los dorsos se organizan en **3 categorías claras**:

### 🔓 DEFAULT (Acceso Inmediato)
- **Quién lo obtiene:** Todos los usuarios desde el inicio
- **Cómo:** Automáticamente al crear una cuenta
- **Ejemplos:** Dorso Clásico, Dorso Básico
- **Uso:** Son el estándar de referencia

```json
{
  "unlock_type": "default",
  "rarity": "common",
  "is_active": true
}
```

### 🏆 ACHIEVEMENT (Logros)
- **Quién lo obtiene:** Jugadores que alcanzan hitos específicos
- **Cómo:** Completando desafíos en el juego
- **Ejemplos:** 
  - Dorso Cósmico: Ganar 10 partidas seguidas
  - Dorso Legendario Divino: Alcanzar rango Diamante
- **Rareza:** Epic a Divine (más valiosos)

```json
{
  "unlock_type": "achievement",
  "rarity": "epic|legendary|divine",
  "is_active": true
}
```

### 💰 PURCHASE (Tienda)
- **Quién lo obtiene:** Jugadores que compran en la tienda
- **Cómo:** Con monedas del juego o dinero real
- **Ejemplos:**
  - Dorso Celestial: 500 monedas
  - Dorso Dorado: 750 monedas
- **Rareza:** Rare a Epic

```json
{
  "unlock_type": "purchase",
  "rarity": "rare|epic",
  "is_active": true
}
```

---

## Instalación de Hugging Face API

### Paso 1: Crear Cuenta Gratuita

1. Ve a https://huggingface.co/join
2. Regístrate con email o GitHub (**totalmente gratis**)
3. Verifica tu email

### Paso 2: Obtener API Token

1. Abre https://huggingface.co/settings/tokens
2. Click en "New token"
3. **Nombre:** `Card Generator`
4. **Tipo:** `Read` (suficiente)
5. Click en "Generate"
6. **Copia el token completo** (empieza con `hf_...`)

### Paso 3: Configurar en .env

```env
HUGGINGFACE_API_KEY=hf_tuTokenAquiSinComillas
```

---

## Uso

### Generar Imágenes de Dorsos

```bash
npm run generate:deck-backs
```

**Qué hace:**
- Genera 3 nuevas imágenes usando IA
- Las guarda en `src/assets/deck-backs/`
- Muestra el progreso en consola
- Tarda ~30-60 segundos total

**Salida esperada:**
```
🚀 Iniciando generación de dorsos para mazos...

📋 Dorsos a generar:
   • Dorso Cósmico (epic) - achievement
   • Dorso Celestial (rare) - purchase
   • Dorso Legendario Divino (divine) - achievement

🎨 Generando: Dorso Cósmico...
✅ Dorso Cósmico generada correctamente
   Rarity: epic
   Type: achievement
   Size: 245.32 KB

... (más dorsos) ...

✅ Generación completada!
```

### Insertar Dorsos en Base de Datos

```bash
npm run seed:deck-backs
```

**Qué hace:**
- Verifica si ya existen dorsos
- Crea los 5 dorsos (1 default, 2 logros, 2 compra)
- Organiza los datos claramente por categoría
- Muestra un resumen de qué se creó

**Salida esperada:**
```
🎴 Iniciando seed de dorsos de mazo...

✅ Dorsos creados correctamente!

📊 Resumen por categoría:

🔓 DEFAULT (Acceso inmediato):
   • Dorso Clásico (common)

🏆 LOGROS (Se desbloquean jugando):
   • Dorso Cósmico (epic)
   • Dorso Legendario Divino (divine)

💰 COMPRA (Disponibles en tienda):
   • Dorso Dorado (rare)
   • Dorso Celestial (rare)
```

### Pipeline Completo

Para hacerlo todo de una vez:

```bash
# 1. Generar imágenes
npm run generate:deck-backs

# 2. Insertar en BD
npm run seed:deck-backs

# 3. Reiniciar servidor (si está corriendo)
npm run dev
```

---

## Estructura de Directorios

```
src/
├── assets/
│   └── deck-backs/
│       ├── cosmic.png              ← Generado por IA
│       ├── celestial.png           ← Generado por IA
│       ├── divine_legendary.png    ← Generado por IA
│       └── golden.png              ← (existente)
├── scripts/
│   ├── generateDeckBackImages.ts   ← Script generador
│   ├── seedDeckBacks-v2.ts         ← Script de inserción
│   └── seedDeckBacks.ts            ← (antiguo)
```

---

## Cómo Definir Nuevos Dorsos

Edita `generateDeckBackImages.ts`:

```typescript
const DECK_BACKS_TO_GENERATE: DeckBackDesign[] = [
  {
    name: 'Nombre del Dorso',
    filename: 'nombre.png',
    prompt: 'Descripción detallada para la IA...',
    unlock_type: 'default' | 'achievement' | 'purchase',
    rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'divine',
    description: 'Cómo obtenerlo (para documentación)'
  },
  // ... más dorsos ...
];
```

### Tips para Prompts Efectivos

**Para logros épicos:**
```
"Cosmic deck back with galaxies and nebulas in deep blues and purples. 
Fantasy card game style, high quality, detailed."
```

**Para dorsos dorados/premium:**
```
"Elegant golden deck back with intricate patterns and gems. 
Luxury card design, shiny and refined, premium quality."
```

**Para dorsos temáticos:**
```
"Saint Seiya themed deck back with angels and celestial imagery. 
Mythological design, radiant gold colors, divine atmosphere."
```

---

## Integración con el Juego

### Cómo los Jugadores Usan los Dorsos

1. **En DeckBuilder:** Seleccionar dorso de mazo
2. **En GameMatch:** Se muestra automáticamente en PlayerDeck y OpponentDeck
3. **En Perfil:** Se ve el dorso del mazo activo

### Backend (API)

**Endpoint:** `GET /api/profile/user/:userId`

Retorna:
```json
{
  "avatar": { ... },
  "deck_back": {
    "id": "uuid",
    "name": "Dorso Clásico",
    "image_url": "/assets/cards/card_back.png"
  }
}
```

---

## Troubleshooting

### Error: "HUGGINGFACE_API_KEY no está configurada"

```bash
# Solución: Añade a .env
echo "HUGGINGFACE_API_KEY=hf_tuToken" >> .env
```

### Imágenes se generan pero no aparecen en juego

1. Verifica que las rutas sean correctas en `seedDeckBacks-v2.ts`
2. Reinicia el servidor: `npm run dev`
3. Limpia caché del cliente Godot

### Modelo cargando (espera 10s y reintenta)

Esto es normal la primera vez. El script espera automáticamente.

---

## Límites y Consideraciones

| Aspecto | Límite | Nota |
|--------|--------|------|
| Requests/mes (Hugging Face) | ~1000 | Suficiente para desarrollo |
| Tiempo generación | 20-40s/imagen | Primera vez tarda más |
| Tamaño imagen | ~200-300 KB | Optimizado para web |
| Almacenamiento | Sin límite | En `assets/deck-backs/` |

---

## Próximas Mejoras

- [ ] Agregar interface en DeckBuilder para vista previa de dorsos
- [ ] Sistema de desbloqueo de logros automático
- [ ] Validar que dorsos no duplicados
- [ ] Generar estadísticas de rareza
- [ ] Integración con tienda (precios de dorsos)

---

**Última actualización:** 20 Enero 2026  
**Versión:** 2.0 (Con Hugging Face + Clasificación clara)
