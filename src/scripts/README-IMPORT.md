# Guía de Scripts de Importación de Cartas

## Scripts disponibles

### 1. `import-all-cards.ts` - Importación completa
Importa todas las cartas desde las carpetas de assets a la base de datos.

**Uso:**
```bash
npx ts-node src/scripts/import-all-cards.ts
```

**Características:**
- Procesa todas las carpetas de assets automáticamente
- Evita duplicados por nombre
- Salta archivos que solo son números (sin nombre)
- Asigna tipo, rareza, costo y stats automáticamente
- Crea registros en `cards` y `card_knights` (para caballeros)

**Mapeo de carpetas:**
- `assistant` → Ayudantes (comun)
- `black` → Caballeros negros, elemento dark (rara)
- `bronzes` → Caballeros de bronce (comun)
- `golds` → Caballeros de oro (epica)
- `legendary` → Caballeros legendarios (legendaria)
- `object` → Objetos (comun)
- `occasion` → Ocasiones (comun)
- `sapuris` → Sapuris (epica)
- `silver` → Caballeros de plata (rara)
- `sonata` → Sonata (epica)
- `stage` → Escenarios (comun)
- `steel` → Caballeros de acero, elemento steel (comun)
- `technique` → Técnicas (comun)
- `tokens` → Tokens/Objetos (comun)

### 2. `count-cards.ts` - Estadísticas
Muestra estadísticas de las cartas en la base de datos.

**Uso:**
```bash
npx ts-node src/scripts/count-cards.ts
```

**Muestra:**
- Total de cartas
- Total de caballeros
- Distribución por tipo
- Distribución por rareza
- Distribución por elemento

### 3. `find-duplicates.ts` - Detectar duplicados
Busca cartas duplicadas por nombre o imagen, y cartas con nombres inválidos.

**Uso:**
```bash
npx ts-node src/scripts/find-duplicates.ts
```

### 4. `clean-database.ts` - Limpiar duplicados
Elimina automáticamente cartas duplicadas y con nombres inválidos.

**Uso:**
```bash
npx ts-node src/scripts/clean-database.ts
```

**⚠️ Advertencia:** Este script elimina permanentemente las cartas. Usar con cuidado.

### 5. `add-element-column.ts` - Migración de elemento
Agrega la columna `element` a la tabla `cards`.

**Uso:**
```bash
npx ts-node src/scripts/add-element-column.ts
```

**Nota:** Solo necesita ejecutarse una vez. Ya fue ejecutado.

## Estado actual de la base de datos

Después de ejecutar el script de importación y limpieza:
- ✅ **128 cartas** totales en la base de datos
- ✅ **37 caballeros** con stats (attack, defense, health, cosmos)
- ✅ **2 duplicados** eliminados
- ✅ Base de datos limpia y lista para usar

### Distribución por tipo:
- Caballero: 38
- Objeto: 32
- Escenario: 24
- Técnica: 16
- Ocasión: 13
- Ayudante: 5

### Distribución por rareza:
- Común: 55
- Épica: 27
- Rara: 26
- Legendaria: 20

### Elementos asignados:
- Cartas con elemento `dark`: Caballeros de la carpeta `black`
- Cartas con elemento `steel`: Caballeros de la carpeta `steel`
- El resto: `element = null` (se pueden asignar manualmente)

## Próximos pasos recomendados

1. **Revisar cartas con nombres numéricos:**
   - Algunas cartas se importaron con nombres como "22gh"
   - Deberías actualizar manualmente estos nombres

2. **Asignar elementos a más cartas:**
   - Actualmente solo las carpetas `black` y `steel` tienen elemento asignado
   - Puedes actualizar manualmente las cartas para asignar elementos

3. **Completar datos de caballeros:**
   - Los stats son básicos según rareza
   - Deberías ajustar attack, defense, health según la carta real

4. **Agregar habilidades:**
   - Usa la tabla `card_abilities` para agregar habilidades a las cartas
   - Vincula con `card_id`

5. **Dar cartas iniciales a usuarios:**
   - Usa `UserCard` para dar cartas a los usuarios
   - Recuerda actualizar `user_quantity` en el frontend

## Comandos útiles

```bash
# Importar todas las cartas
npx ts-node src/scripts/import-all-cards.ts

# Ver estadísticas
npx ts-node src/scripts/count-cards.ts

# Ejecutar el servidor
npm run dev

# Ver todas las cartas en la API
curl http://localhost:3000/api/cards
```
