# 🚀 Guía Rápida: Importación de Cartas Extendidas

## Pasos para Importar Cartas

### 1️⃣ Ejecutar Migración (Solo la primera vez)

```bash
npx ts-node src/scripts/migrations/add-extended-card-fields.ts
```

✅ Esto agrega los nuevos campos a la tabla `cards`:
- `generate`, `max_copies`, `unique`, `playable_zones`
- `collection_id`, `artist`, `language`
- `balance_notes`, `power_level`, `tags`
- `card_set`, `release_year`, `notes`

### 2️⃣ Crear tu JSON de Cartas

Usa `example-extended-card.json` como referencia o revisa `docs/EXTENDED-CARD-FORMAT.md`

**Ejemplo mínimo:**
```json
[
  {
    "id": "unique-id-001",
    "card_name": "Mi Carta",
    "image_url": "/assets/folder/image.webp",
    "type": "caballero",
    "rarity": "legendaria",
    "cost": 2,
    "generate": 1,
    "knight_stats": {
      "attack": 10,
      "defense": 8,
      "health": 12,
      "cosmos": 8
    }
  }
]
```

### 3️⃣ Importar las Cartas

```bash
# Con nombre de archivo por defecto (cards-extended.json)
npx ts-node src/scripts/import-extended-cards.ts

# Con archivo específico
npx ts-node src/scripts/import-extended-cards.ts mi-archivo.json
```

### 4️⃣ Verificar Resultados

El script mostrará:
```
✅ Cartas creadas: 5
✏️  Cartas actualizadas: 3
❌ Errores: 0
```

## 📋 Campos del JSON

### ✅ Obligatorios
- `id`: UUID o código único
- `card_name`: Nombre de la carta
- `image_url`: Ruta a la imagen
- `type`: Tipo de carta (caballero, tecnica, objeto, etc.)
- `rarity`: Rareza (comun, rara, epica, legendaria, divina)
- `cost`: Coste de cosmos
- `generate`: Cosmos que genera

### 🎯 Recomendados
- `description`: Texto descriptivo
- `element`: Elemento de la carta (steel, fire, water, earth, wind, light, dark)
- `faction`: Facción (Divine Saint, Black Saints, etc.)
- `max_copies`: Máximo en deck (default: 3)
- `collection_id`: ID de la colección original
- `tags`: Array de etiquetas para búsqueda

### 📊 Para Caballeros
```json
"knight_stats": {
  "attack": 10,
  "defense": 8,
  "health": 12,
  "cosmos": 8
}
```

### 🌟 Para Habilidades
```json
"abilities": [
  {
    "name": "Nombre de Habilidad",
    "type": "activa",
    "description": "Descripción del efecto",
    "conditions": {
      "trigger": "on_attack"
    },
    "effects": [
      {
        "type": "deal_damage",
        "damage": 3,
        "target": "single_enemy"
      }
    ]
  }
]
```

## 🔄 Actualizar Cartas Existentes

El script detecta cartas existentes por:
1. `collection_id` (si existe)
2. `image_url` (si no hay collection_id)

Para actualizar una carta, simplemente ejecuta el script con el JSON que contenga el mismo `collection_id` o `image_url` con los nuevos valores.

## 📚 Ejemplos Completos

Ver archivos:
- `example-extended-card.json` - Aldebarán God Cloth completo
- `docs/EXTENDED-CARD-FORMAT.md` - Documentación completa
- `docs/COMENTARIO-JSON-EXTENDIDO.md` - Explicación del diseño

## ⚠️ Notas Importantes

1. **max_copies**:
   - `3` = Máximo estándar
   - `1` = Semi-limitada
   - `0` = Solo 1 en deck (carta única)

2. **unique vs max_copies**:
   - `max_copies`: Límite en el **deck**
   - `unique`: Solo 1 en **juego** simultáneamente

3. **card_set** (no "set"):
   - Nombre correcto del campo es `card_set`
   - `set` está reservado por Sequelize

4. **Habilidades**:
   - El script elimina y recrea todas las habilidades
   - No intenta actualizar habilidades existentes

## 🎮 Workflow Recomendado

1. Crear JSON con 5-10 cartas de prueba
2. Importar y verificar en base de datos
3. Ajustar formato según necesidad
4. Importar set completo
5. Actualizar balance con nuevos JSONs según sea necesario
