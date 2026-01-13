# Guía para Crear Cartas Completas

## 📋 Ejemplo: Black Dragon (Dragón Negro)

El archivo `black-dragon-example.json` muestra el formato completo para una carta tipo **caballero**:

```json
{
  "card_name": "Black Dragon",
  "image_url": "/assets/black/1.webp",
  "type": "caballero",
  "rarity": "rara",
  "element": "dark",
  "faction": "Black Saints",
  "cost": 2,
  "description": "Dragón Negro de los Santos Negros...",
  "knight_stats": {
    "attack": 3,
    "defense": 6,
    "health": 8,
    "cosmos": 2
  },
  "abilities": [...]
}
```

## 📚 Plantilla Completa

El archivo `cards-template.json` contiene ejemplos de **todos los tipos de cartas**:

1. **Caballero** (Black Dragon, Pegasus Seiya)
2. **Ayudante** (Hilda)
3. **Objeto** (Mjolnir)
4. **Escenario** (Yggdrasil)
5. **Ocasión** (Arrival)
6. **Técnica** (Meteoro de Pegaso)

## 🔧 Campos de una Carta

### Campos Obligatorios (todas las cartas)

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `card_name` | string | Nombre de la carta | "Black Dragon" |
| `image_url` | string | Ruta de la imagen | "/assets/black/1.webp" |
| `type` | enum | Tipo de carta | "caballero", "tecnica", "objeto", "escenario", "ayudante", "ocasion" |
| `rarity` | enum | Rareza | "comun", "rara", "epica", "legendaria", "divina" |
| `cost` | number | Costo de cosmos | 2 |
| `description` | string | Descripción de la carta | "Un poderoso guerrero..." |
| `abilities` | array | Lista de habilidades | Ver abajo |

### Campos Opcionales

| Campo | Tipo | Descripción | Ejemplo |
|-------|------|-------------|---------|
| `element` | enum | Elemento de la carta | "steel", "fire", "water", "earth", "wind", "light", "dark", null |
| `faction` | string | Facción | "Athena", "Asgard", "Black Saints", null |

### Campos Solo para Caballeros

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `knight_stats` | object | Stats del caballero |
| `knight_stats.attack` | number | Ataque |
| `knight_stats.defense` | number | Defensa |
| `knight_stats.health` | number | Vida |
| `knight_stats.cosmos` | number | Cosmos inicial |

## 🎯 Estructura de Habilidades

Cada habilidad tiene esta estructura:

```json
{
  "name": "Nombre de la habilidad",
  "type": "activa",
  "description": "Descripción de lo que hace",
  "conditions": {
    "cosmos_required": 2
  },
  "effects": {
    "damage": 3,
    "target": "single_enemy"
  }
}
```

### Tipos de Habilidades

| Tipo | Descripción | Usado en |
|------|-------------|----------|
| `activa` | Se activa al usar | Caballeros, Técnicas |
| `pasiva` | Efecto permanente | Caballeros |
| `equipamiento` | Se equipa a otra carta | Objetos |
| `campo` | Afecta el campo de juego | Escenarios, Ayudantes |

### Ejemplos de Efectos

#### Habilidad de Ataque
```json
{
  "name": "Dark Effect",
  "type": "activa",
  "description": "Reduce la defensa del enemigo",
  "conditions": {
    "cosmos_required": 2
  },
  "effects": {
    "defense_reduction": 2,
    "target": "single_enemy",
    "duration": 2
  }
}
```

#### Habilidad Pasiva con Condición
```json
{
  "name": "Black Saint",
  "type": "pasiva",
  "description": "Bonus con aliados de la misma facción",
  "effects": {
    "attack_boost": 1,
    "condition": "black_saint_ally_present",
    "faction_synergy": "Black Saints"
  }
}
```

#### Equipamiento
```json
{
  "name": "Poder del Trueno",
  "type": "equipamiento",
  "description": "Aumenta el ataque",
  "effects": {
    "attack_boost": 2,
    "element_grant": "steel",
    "compatible_with": ["steel", "Asgard", "caballero"]
  }
}
```

#### Efecto de Campo
```json
{
  "name": "Raíces del Mundo",
  "type": "campo",
  "description": "Genera cosmos cada turno",
  "effects": {
    "cosmos_generation": 1,
    "target": "all_characters",
    "trigger": "start_of_turn"
  }
}
```

## 📝 Cómo Crear tu Archivo de Cartas

1. **Copia `cards-template.json`** y renómbralo a `cards-complete.json`

2. **Edita el archivo** con tus cartas. El formato es:
```json
{
  "cards": [
    {
      "card_name": "...",
      ...
    },
    {
      "card_name": "...",
      ...
    }
  ]
}
```

3. **Para cada carta**, incluye:
   - Datos básicos (nombre, imagen, tipo, rareza, costo)
   - `knight_stats` si es caballero
   - Array de `abilities` (mínimo 1, máximo recomendado 3)

4. **Importa las cartas**:
```bash
npx ts-node src/scripts/import-complete-cards.ts cards-complete.json
```

## 🎨 Guía de Rarezas

Según el símbolo en la imagen:

| Rareza | Símbolo/Color | Descripción |
|--------|---------------|-------------|
| `comun` | Bronce | Cartas básicas |
| `rara` | Plata | Cartas poco comunes |
| `epica` | Oro | Cartas poderosas |
| `legendaria` | Rojo/Especial | Cartas muy raras |
| `divina` | Símbolo especial | Solo dioses |

## 🔮 Guía de Elementos

| Elemento | Descripción | Ejemplos |
|----------|-------------|----------|
| `steel` | Acero | Guerreros Divinos |
| `fire` | Fuego | Phoenix Ikki |
| `water` | Agua | Aquarius Camus |
| `earth` | Tierra | Tauro Aldebaran |
| `wind` | Viento | Pegasus Seiya |
| `light` | Luz | Santos de Athena |
| `dark` | Oscuridad | Santos Negros |
| `null` | Sin elemento | Genéricos |

## ⚔️ Guía de Facciones

| Facción | Descripción |
|---------|-------------|
| `Athena` | Santos de Athena |
| `Asgard` | Guerreros Divinos |
| `Black Saints` | Santos Negros |
| `Poseidon` | Generales de Poseidón |
| `Hades` | Espectros de Hades |

## 💡 Tips

1. **Habilidades de caballeros**: Generalmente 2-3 habilidades (1-2 activas + 1 pasiva)
2. **Objetos**: 1 habilidad de tipo `equipamiento`
3. **Escenarios**: 1-2 habilidades de tipo `campo`
4. **Ayudantes**: 1 habilidad de tipo `campo`
5. **Técnicas**: 1 habilidad `activa` que puede equiparse
6. **Ocasiones**: 1 habilidad `activa` de uso único

## 📊 Valores Recomendados para Stats

### Caballeros por Rareza

| Rareza | Attack | Defense | Health | Cosmos |
|--------|--------|---------|--------|--------|
| Común | 2-3 | 2-3 | 4-6 | 0-1 |
| Rara | 3-4 | 3-5 | 6-8 | 1-2 |
| Épica | 4-5 | 4-6 | 8-10 | 2-3 |
| Legendaria | 5-6 | 5-7 | 10-12 | 3-4 |
| Divina | 6-8 | 6-8 | 12-15 | 4-5 |

### Costos Recomendados

| Rareza | Costo de Cosmos |
|--------|-----------------|
| Común | 1-2 |
| Rara | 2-3 |
| Épica | 3-4 |
| Legendaria | 4-5 |
| Divina | 5-6 |
