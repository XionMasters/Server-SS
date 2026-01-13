# Fixes Implementados

## 1. ✅ Drag & Drop Corregido

### Problema
Las cartas se agregaban en lugares incorrectos al soltarlas.

### Solución
- **CardSlot.gd**: Modificado `_drop_data()` para incluir información del slot de destino en el evento
- Ahora se emite `target_slot`, `slot_type` y `slot_index` junto con la carta dropeada
- Esto permite a GameBoard.gd colocar la carta exactamente donde se soltó

### Archivos Modificados
- `ccg/scripts/game/CardSlot.gd` (líneas 119-129)

---

## 2. ✅ Marcas de Agua Visibles

### Problema
Las marcas de agua (C, T/O, A, E, O) no se veían en los slots vacíos.

### Solución
- **Aumentada opacidad**: De 0.85 a 0.95 en todos los colores
- **Corregido z-index**: De -100 a -1 (estaba demasiado atrás)
- **Añadido `mouse_filter = IGNORE`**: Para evitar que bloqueen eventos de mouse

### Cambios Visuales
- **C** (Caballero): Dorado más brillante
- **T/O** (Técnica/Objeto): Azul más fuerte
- **A** (Ayudante): Verde más intenso
- **E** (Escenario): Magenta más vivo
- **O** (Ocasión): Naranja más fuerte

### Archivos Modificados
- `ccg/scripts/game/CardSlot.gd` (líneas 60-76, 87-89)

---

## 3. ✅ Puntos de Vida/Cosmos Mejorados

### Problema
Los puntos se veían como línea continua, difícil de interpretar.

### Solución
Se agregó un **label numérico central** en el avatar que muestra:

```
12/12  ← Vida actual/máxima
8/12   ← Cosmos actual/máximo
```

### Características
- **Fuente blanca** con contorno negro (4px)
- **Tamaño**: 16px
- **Centrado** en el círculo del avatar
- **Se actualiza automáticamente** cuando cambian HP/CP
- **No bloquea clics** (mouse_filter = IGNORE)

### Archivos Modificados
- `ccg/scenes/ui/AvatarDisplay.gd`:
  - Nueva variable `@onready var stats_label`
  - Nueva función `_create_stats_label()`
  - Nueva función `_update_stats_label()`
  - Llamadas en `_ready()`, `setup()`, `update_health()`, `update_cosmos()`

---

## 4. 🆕 Sistema de Perfiles de Usuario

### Características
- **Avatares de perfil** configurables por usuario
- **Sistema de desbloqueo**:
  - 3 avatares por defecto (siempre disponibles)
  - Avatares desbloqueables al obtener cartas legendarias
  - Sistema extensible para logros futuros

### Estructura de Base de Datos

#### Tabla `profile_avatars`
```sql
- id (UUID)
- name (String)
- image_url (String)
- unlock_type (ENUM: default, card_unlock, achievement, special)
- required_card_id (UUID, nullable) ← Carta necesaria para desbloquear
- rarity (ENUM: common, rare, epic, legendary, divine)
- is_active (Boolean)
```

#### Tabla `user_avatar_unlocks`
```sql
- id (UUID)
- user_id (UUID)
- avatar_id (UUID)
- unlocked_at (Date)
- unlock_source (String) ← "pack_opening", "achievement", etc.
- UNIQUE INDEX (user_id, avatar_id)
```

#### Tabla `user_profiles`
```sql
- id (UUID)
- user_id (UUID, UNIQUE)
- avatar_image_id (UUID) ← Avatar actualmente seleccionado
```

### API Endpoints

#### `GET /api/profile`
Obtener perfil del usuario autenticado.

**Response:**
```json
{
  "profile": {
    "id": "uuid",
    "user_id": "uuid",
    "avatar_image_id": "uuid",
    "avatar": {
      "id": "uuid",
      "name": "Avatar Bronce 1",
      "image_url": "/assets/profile-avatars/bronze-1.webp",
      "unlock_type": "default",
      "rarity": "common"
    }
  },
  "message": "Perfil obtenido correctamente"
}
```

#### `GET /api/profile/avatars`
Obtener todos los avatares (desbloqueados y bloqueados).

**Response:**
```json
{
  "avatars": [
    {
      "id": "uuid",
      "name": "Avatar Bronce 1",
      "image_url": "/assets/profile-avatars/bronze-1.webp",
      "unlock_type": "default",
      "rarity": "common",
      "is_unlocked": true
    },
    {
      "id": "uuid",
      "name": "Avatar Mu de Aries",
      "image_url": "/assets/golds/1.webp",
      "unlock_type": "card_unlock",
      "required_card_id": "uuid",
      "required_card": {
        "id": "uuid",
        "name": "Mu de Aries",
        "rarity": "legendaria"
      },
      "rarity": "legendary",
      "is_unlocked": false  ← Usuario no tiene la carta
    }
  ],
  "message": "Avatares disponibles obtenidos"
}
```

#### `PUT /api/profile/avatar`
Cambiar avatar actual.

**Body:**
```json
{
  "avatar_id": "uuid"
}
```

**Response:**
```json
{
  "profile": { ... },
  "message": "Avatar actualizado correctamente"
}
```

**Errores:**
- 403: "No tienes desbloqueado este avatar"

#### `POST /api/profile/check-unlocks`
Verificar y desbloquear automáticamente avatares basados en cartas obtenidas.

**Response:**
```json
{
  "new_unlocks": [
    {
      "avatar": {
        "id": "uuid",
        "name": "Avatar Mu de Aries",
        "image_url": "/assets/golds/1.webp"
      },
      "unlock": {
        "unlocked_at": "2025-11-20T...",
        "unlock_source": "card_legendary_obtained"
      }
    }
  ],
  "message": "¡1 nuevo(s) avatar(es) desbloqueado(s)!"
}
```

### Flujo de Desbloqueo Automático

1. Usuario abre sobre y obtiene carta legendaria
2. Backend guarda carta en `user_cards`
3. Backend llama automáticamente a lógica de desbloqueo
4. Si hay avatar vinculado a esa carta → se desbloquea
5. Usuario ve notificación: "¡Nuevo avatar desbloqueado!"

### Scripts de Configuración

#### Crear Tablas
```bash
ts-node src/scripts/create-profile-tables.ts
```

#### Seed de Avatares
```bash
ts-node src/scripts/seed-profile-avatars.ts
```

**Seed incluye:**
- 3 avatares por defecto (Bronze 1, 2, 3)
- 1 avatar por cada carta legendaria en la DB (máx. 12 dorados)

### Archivos Creados

**Modelos:**
- `src/models/UserProfile.ts`
- `src/models/ProfileAvatar.ts`
- `src/models/UserAvatarUnlock.ts`

**Controladores:**
- `src/controllers/profile.controller.ts`

**Rutas:**
- `src/routes/profile.routes.ts`

**Scripts:**
- `src/scripts/create-profile-tables.ts` (migración)
- `src/scripts/seed-profile-avatars.ts` (seed)

**App:**
- `src/app.ts` (agregada ruta `/api/profile`)

---

## Próximos Pasos Sugeridos

### Para el Sistema de Perfiles

1. **Crear carpeta de avatares**:
   ```
   src/assets/profile-avatars/
   ├── bronze-1.webp
   ├── bronze-2.webp
   ├── bronze-3.webp
   └── default-gold.webp
   ```

2. **Ejecutar migraciones**:
   ```bash
   ts-node src/scripts/create-profile-tables.ts
   ts-node src/scripts/seed-profile-avatars.ts
   ```

3. **Integrar en apertura de sobres**:
   - En `packs.controller.ts`, después de guardar cartas:
   ```typescript
   // Verificar desbloqueos de avatares
   const unlockResponse = await checkCardUnlocks(req, res);
   ```

4. **UI en Godot**:
   - Pantalla de perfil para cambiar avatar
   - Galería de avatares con candados en los bloqueados
   - Notificación cuando se desbloquea uno nuevo

### Para Drag & Drop

- Testear exhaustivamente en diferentes slots
- Agregar feedback visual al arrastrar (preview de dónde caerá)

### Para Marcas de Agua

- Ajustar tamaños/colores según diseño final
- Considerar agregar íconos en lugar de letras

### Para HP/CP Display

- Agregar animación al cambiar números
- Considerar colores por estado (rojo si HP bajo, azul brillante si CP alto)

---

## Testing

### Drag & Drop
1. Arrastra carta de mano a slot de caballero → debe aparecer ahí
2. Arrastra carta de técnica a slot de técnica → debe aparecer ahí
3. Intenta arrastrar caballero a slot de técnica → debe rechazar

### Marcas de Agua
1. Slots vacíos deben mostrar letras grandes y visibles
2. Al colocar carta, marca debe desaparecer
3. Al quitar carta, marca debe reaparecer

### HP/CP Display
1. Iniciar partida → debe mostrar "12/12" y "0/12"
2. Recibir daño → número superior debe actualizarse
3. Ganar cosmos → número inferior debe actualizarse

### Perfiles
1. `GET /api/profile` → debe crear perfil con avatar por defecto si no existe
2. `GET /api/profile/avatars` → debe mostrar avatares desbloqueados/bloqueados
3. `PUT /api/profile/avatar` con avatar bloqueado → debe dar error 403
4. Obtener carta legendaria → `POST /api/profile/check-unlocks` debe desbloquear avatar
