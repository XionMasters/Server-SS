# Formato Extendido de Cartas

## Descripción General

Este documento describe el formato JSON extendido para importar cartas con todos sus datos, incluyendo metadatos de colección, balanceo y mecánicas de juego.

## Estructura Completa del JSON

```json
{
  "id": "stcga-ald-001",
  "card_name": "Taurus Aldebaran",
  "image_url": "/assets/gold/Divine_Aldebaran_Taurus.webp",
  "type": "caballero",
  "rarity": "legendaria",
  "element": "light",
  "faction": "Divine Saint",
  "cost": 0,
  "generate": 0,
  "description": "Aldebarán de Tauro en su God Cloth...",
  "knight_stats": { ... },
  "abilities": [ ... ],
  "max_copies": 0,
  "unique": true,
  "playable_zones": ["battlefield"],
  "collection_id": "STCGA-ALD-001",
  "artist": "Willytox",
  "language": "es",
  "balance_notes": "...",
  "power_level": 95,
  "tags": ["divine", "tauro", "regen"],
  "card_set": "GodClothSeries",
  "release_year": 2012,
  "notes": "Basada en carta STCGA..."
}
```

## Campos Principales

### Identificación
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | string | ✅ | UUID o código único de la carta |
| `card_name` | string | ✅ | Nombre de la carta |
| `image_url` | string | ✅ | Ruta a la imagen de la carta |
| `collection_id` | string | ❌ | ID único en la colección original (ej: STCGA-ALD-001) |

### Propiedades de Juego
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `type` | enum | ✅ | `caballero`, `tecnica`, `objeto`, `escenario`, `ayudante`, `ocasion` |
| `rarity` | enum | ✅ | `comun`, `rara`, `epica`, `legendaria`, `divina` |
| `element` | enum | ❌ | `steel`, `fire`, `water`, `earth`, `wind`, `light`, `dark`, `null` |
| `faction` | string | ❌ | Facción de la carta (ej: "Divine Saint", "Black Saints") |
| `cost` | number | ✅ | Coste de cosmos para jugar la carta |
| `generate` | number | ✅ | Cantidad de cosmos que genera al jugarse |
| `description` | string | ❌ | Descripción de la carta |

### Restricciones de Deck
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `max_copies` | number | ❌ | Máximo de copias permitidas en un deck (default: 3) |
| `unique` | boolean | ❌ | Si es única (solo 1 en juego simultáneamente) |
| `playable_zones` | string[] | ❌ | Zonas donde se puede jugar (default: `["battlefield"]`) |

### Metadatos de Colección
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `artist` | string | ❌ | Nombre del artista/creador |
| `language` | string | ❌ | Idioma de la carta (default: "es") |
| `card_set` | string | ❌ | Nombre del set/colección |
| `release_year` | number | ❌ | Año de lanzamiento |
| `notes` | string | ❌ | Notas adicionales o historia |

### Balanceo y Análisis
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `balance_notes` | string | ❌ | Notas de balanceo y diseño |
| `power_level` | number | ❌ | Nivel de poder estimado (0-100) |
| `tags` | string[] | ❌ | Etiquetas de búsqueda y categorización |

## Stats de Caballero

Para cartas de tipo `caballero`, incluir `knight_stats`:

```json
"knight_stats": {
  "attack": 13,
  "defense": 10,
  "health": 12,
  "cosmos": 10
}
```

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `attack` | number | Poder de ataque base |
| `defense` | number | Poder de defensa |
| `health` | number | Puntos de vida |
| `cosmos` | number | Cosmos total del caballero |

## Habilidades

Array de habilidades de la carta:

```json
"abilities": [
  {
    "name": "Cosmic Wrap",
    "type": "activa",
    "description": "El próximo BA del usuario aplica PAR...",
    "conditions": {
      "trigger": "on_attack",
      "scope": "next_attack",
      "one_time": true,
      "cooldown_turns": 0
    },
    "effects": [
      {
        "type": "apply_status",
        "status": "PAR",
        "duration_turns": 1,
        "chance_percent": 100,
        "target": "single_enemy"
      }
    ]
  }
]
```

### Tipos de Habilidad
- `activa`: Se activa manualmente
- `pasiva`: Siempre activa
- `equipamiento`: Habilidad de equipo
- `campo`: Efecto de campo

### Conditions (Condiciones de Activación)
| Campo | Descripción |
|-------|-------------|
| `trigger` | Evento que activa (`on_attack`, `on_turn_end`, `on_damage`, etc) |
| `scope` | Alcance (`next_attack`, `permanent`, `until_end_turn`) |
| `one_time` | Si se activa solo una vez |
| `cooldown_turns` | Turnos de espera entre activaciones |
| `requirements` | Requisitos adicionales |
| `check` | Condición lógica a evaluar |

### Effects (Efectos)
Cada efecto tiene un `type` y propiedades específicas:

**apply_status** - Aplicar estado
```json
{
  "type": "apply_status",
  "status": "PAR",
  "duration_turns": 1,
  "chance_percent": 100,
  "target": "single_enemy"
}
```

**restore_resource** - Restaurar recurso
```json
{
  "type": "restore_resource",
  "resource": "DLP",
  "amount": 1,
  "target": "self"
}
```

**deal_damage** - Hacer daño
```json
{
  "type": "deal_damage",
  "damage": 3,
  "target": "single_enemy",
  "ignore_defense": false
}
```

**modify_stats** - Modificar stats
```json
{
  "type": "modify_stats",
  "stat": "attack",
  "modifier": 2,
  "duration_turns": 1,
  "target": "self"
}
```

## Uso del Script

### 1. Ejecutar Migración
Primero agregar los nuevos campos a la base de datos:

```bash
npx ts-node src/scripts/migrations/add-extended-card-fields.ts
```

### 2. Importar Cartas
Crear un archivo JSON con las cartas (puede ser array o un solo objeto) y ejecutar:

```bash
# Con nombre de archivo por defecto (cards-extended.json)
npx ts-node src/scripts/import-extended-cards.ts

# Con archivo específico
npx ts-node src/scripts/import-extended-cards.ts example-extended-card.json
```

### 3. Actualizar Cartas Existentes
El script detecta cartas existentes por `collection_id` o `image_url` y las actualiza en lugar de crear duplicados.

## Notas Importantes

### Max Copies
- `max_copies: 3` - Máximo estándar
- `max_copies: 1` - Solo una copia permitida
- `max_copies: 0` - Carta única (misma funcionalidad que `unique: true`)

### Unique Flag
- `unique: true` - Solo puede haber 1 de esta carta **en juego** al mismo tiempo
- `unique: false` - Se pueden tener múltiples en campo (respetando `max_copies` en deck)

### Power Level
Escala sugerida:
- 0-20: Cartas comunes básicas
- 21-40: Cartas raras con efectos simples
- 41-60: Cartas épicas con mecánicas complejas
- 61-80: Cartas legendarias poderosas
- 81-100: Cartas divinas/god cloth

### Playable Zones
Opciones comunes:
- `["battlefield"]` - Solo en campo de batalla (default)
- `["hand", "battlefield"]` - Se puede activar desde mano
- `["deck"]` - Efectos que se activan desde deck
- `["graveyard"]` - Efectos que funcionan desde cementerio

## Ejemplos por Tipo de Carta

### Caballero
```json
{
  "type": "caballero",
  "knight_stats": { ... },
  "abilities": [ ... ]
}
```

### Técnica
```json
{
  "type": "tecnica",
  "cost": 2,
  "generate": 0,
  "abilities": [
    {
      "name": "Meteoro de Pegaso",
      "type": "activa",
      "description": "Inflige 3 de daño..."
    }
  ]
}
```

### Objeto
```json
{
  "type": "objeto",
  "cost": 1,
  "playable_zones": ["battlefield"],
  "abilities": [
    {
      "name": "Mjolnir",
      "type": "equipamiento",
      "description": "+2 ATK al portador"
    }
  ]
}
```

### Escenario
```json
{
  "type": "escenario",
  "playable_zones": ["battlefield"],
  "abilities": [
    {
      "name": "Yggdrasil",
      "type": "campo",
      "description": "Todos los caballeros recuperan +1 DLP..."
    }
  ]
}
```
