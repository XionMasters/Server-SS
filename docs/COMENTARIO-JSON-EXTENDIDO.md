# Comentario: Sistema de Importación JSON Extendido

## 📋 Resumen de Cambios

Hemos implementado un **formato JSON extendido** para la importación de cartas que incluye toda la información necesaria para una gestión completa del juego, desde metadatos de colección hasta mecánicas detalladas de balanceo.

## 🎯 Motivación del Diseño

### Campos de Juego Base
- **`card_name`**: Separado de `name` interno para permitir traducciones futuras
- **`cost` y `generate`**: Mecánica fundamental de cosmos - cuánto cuesta jugar y cuánto genera
- **`element`**: Permite sinergias elementales y contadores en el juego
- **`rarity`**: Ahora incluye `divina` para God Cloths y cartas especiales

### Gestión de Deck Building
- **`max_copies`**: Control fino de balance por carta
  - `3` = estándar
  - `1` = semi-limitada
  - `0` = única/prohibida (solo 1 en deck)
- **`unique`**: Para cartas legendarias que no pueden estar duplicadas **en juego** simultáneamente
  - Ejemplo: Solo puede haber un Aldebarán God Cloth en el campo a la vez
- **`playable_zones`**: Define desde dónde se pueden activar
  - Permite cartas que se activan desde mano, cementerio, o deck
  - Fundamental para efectos como "cuando esta carta está en tu mano"

### Metadatos de Colección
Estos campos son cruciales para mantener el origen y crédito de las cartas:

- **`collection_id`**: ID único de la colección original (ej: STCGA-ALD-001)
  - Permite referenciar cartas de colecciones físicas o anteriores
  - Útil para importar sets completos de diseñadores como Willytox
- **`artist`**: Reconocimiento al creador
- **`card_set`**: Agrupación por series (GodClothSeries, BronzeSeries, etc.)
- **`release_year`**: Historial de cuando se creó la carta
- **`notes`**: Contexto adicional, inspiración, cambios de versión

### Sistema de Balanceo
- **`balance_notes`**: Documentación del diseñador sobre intención y ajustes
  - Ejemplo: "Esta carta fue nerfeada de 15 ATK a 13 por dominar el meta"
- **`power_level`**: Métrica numérica (0-100) para:
  - Análisis de meta
  - Restricciones de formato (ej: "formato de cartas <60 power")
  - Matchmaking balanceado
- **`tags`**: Búsqueda y categorización flexible
  - Arquetipos: `["burn", "control", "aggro"]`
  - Personajes: `["seiya", "athena", "poseidon"]`
  - Mecánicas: `["regen", "draw", "mill"]`

## 🔧 Decisiones Técnicas

### ¿Por qué JSONB para abilities.effects?
Array de efectos en lugar de objeto único permite:
```json
"effects": [
  { "type": "deal_damage", "damage": 3 },
  { "type": "apply_status", "status": "BURN" },
  { "type": "draw_cards", "amount": 1 }
]
```
Una sola habilidad puede tener múltiples efectos encadenados.

### ¿Por qué conditions separado de effects?
Separar condiciones de activación de los efectos permite:
- **Reutilización**: Mismo efecto con diferentes triggers
- **Claridad**: Lectura más clara del JSON
- **Validación**: Verificar condiciones antes de aplicar efectos
- **Cooldowns**: Gestionar tiempos de espera independientes

### ¿Por qué max_copies puede ser 0?
- `max_copies: 0` significa "solo 1 permitida en deck"
- `max_copies: 1` significaría "permitida solo 1 vez" (mismo efecto)
- Usamos 0 por convención estándar de TCGs (banned = 0, limited = 1, semi-limited = 2)

### ¿Por qué card_set en lugar de set?
- `set` es palabra reservada de Sequelize (método para asignar valores)
- `card_set` evita conflictos y es más descriptivo
- Mantenemos coherencia con `card_name` vs campo interno `name`

## 🎮 Flujo de Uso

### 1. Preparación de Datos
```json
{
  "id": "stcga-ald-001",
  "card_name": "Taurus Aldebaran",
  "collection_id": "STCGA-ALD-001",
  "rarity": "legendaria",
  "max_copies": 0,
  "unique": true
}
```

### 2. Migración
```bash
npx ts-node src/scripts/migrations/add-extended-card-fields.ts
```
Agrega 13 nuevos campos a la tabla `cards`

### 3. Importación
```bash
npx ts-node src/scripts/import-extended-cards.ts cards-god-cloths.json
```
- Detecta duplicados por `collection_id` o `image_url`
- Actualiza cartas existentes en lugar de crear duplicados
- Crea/actualiza stats de caballero
- Recrea todas las habilidades

### 4. Actualización Incremental
El mismo script sirve para:
- Importar nuevas cartas
- Actualizar stats de cartas existentes
- Modificar habilidades
- Ajustar valores de balance

## 📊 Casos de Uso

### Balance Patches
```json
{
  "collection_id": "STCGA-ALD-001",
  "knight_stats": {
    "attack": 12,  // Reducido de 13
    "defense": 10
  },
  "balance_notes": "Reducción de ATK por dominar formato competitivo",
  "power_level": 90  // Reducido de 95
}
```

### Traducciones
```json
[
  {
    "collection_id": "STCGA-ALD-001",
    "card_name": "Taurus Aldebaran",
    "language": "es"
  },
  {
    "collection_id": "STCGA-ALD-001",
    "card_name": "Aldébaran de Taurus",
    "language": "pt"
  }
]
```

### Gestión de Formatos
```sql
-- Cartas legales en formato "Vintage" (todas)
SELECT * FROM cards WHERE card_set IS NOT NULL;

-- Cartas legales en formato "Modern" (2010+)
SELECT * FROM cards WHERE release_year >= 2010;

-- Formato "Pauper" (solo comunes y raras)
SELECT * FROM cards WHERE rarity IN ('comun', 'rara');

-- Formato "Powered" (power_level < 70)
SELECT * FROM cards WHERE power_level < 70 OR power_level IS NULL;
```

## 🚀 Ventajas del Sistema

1. **Trazabilidad Completa**: Cada carta tiene historial y origen
2. **Balance Iterativo**: Fácil ajustar stats y documentar por qué
3. **Importación Masiva**: Un JSON puede importar set completo
4. **Actualización Segura**: No crea duplicados, solo actualiza
5. **Metadatos Ricos**: Tags y notas permiten búsqueda avanzada
6. **Formatos Flexibles**: power_level y release_year para restricciones
7. **Compatibilidad**: Campos opcionales mantienen compatibilidad con cartas antiguas

## 📝 Mejoras Futuras

### Validación Automática
- Script que verifique power_level vs stats reales
- Alertas de cartas con power_level muy bajo/alto para sus stats
- Detección de habilidades sin efectos o condiciones

### Generación de Cartas
- Template generator: `create-card.ts --type caballero --rarity legendaria`
- Auto-cálculo de power_level basado en stats y habilidades
- Sugerencias de tags basadas en habilidades

### Analytics
- Dashboard de distribución por rarity, element, faction
- Análisis de power_level promedio por set
- Detección de cartas infrautilizadas (candidatas a buff)

### Versionado
- Tabla `card_versions` para mantener historial
- Cada actualización crea nueva versión
- API para obtener carta en versión específica

## 🎯 Conclusión

Este formato JSON extendido transforma la base de datos de un simple repositorio de cartas a un **sistema completo de gestión de TCG** con:
- Balance tracking
- Metadatos de colección
- Restricciones de formato
- Trazabilidad completa

La estructura es suficientemente flexible para evolucionar pero lo suficientemente estructurada para mantener integridad de datos.
