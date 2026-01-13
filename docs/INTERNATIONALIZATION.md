# Sistema de Internacionalización (i18n)

## 🌍 Resumen

Sistema completo de internacionalización para soportar 3 idiomas en el juego:
- **Español (ES)** - Idioma por defecto
- **English (EN)** - Inglés
- **Português (PT)** - Portugués

## 📂 Estructura

### Backend (API)
```
src/
├── models/
│   └── CardTranslation.ts          # Modelo de traducciones
├── scripts/
│   └── migrations/
│       └── create-card-translations-table.ts  # Migración
```

### Frontend (Godot)
```
scripts/
└── managers/
    └── LocalizationManager.gd      # Singleton de i18n

scenes/
└── ui/
    ├── LanguageSelector.gd         # UI de selección
    └── LanguageSelector.tscn       # Escena de selector
```

## 🚀 Configuración Inicial

### 1. Backend - Crear Tabla de Traducciones

```bash
cd "d:\Disco E\Proyectos\Server-SS"
npx ts-node src/scripts/migrations/create-card-translations-table.ts
```

Esto crea la tabla `card_translations` con:
- `id` (UUID)
- `card_id` (referencia a cards)
- `language` (ENUM: es, en, pt)
- `name` (traducción del nombre)
- `description` (traducción de descripción)
- `ability_translations` (JSONB con traducciones de habilidades)

### 2. Godot - Configurar Autoload

En `Project Settings` → `Autoload`:

Agregar:
- **Name**: `Localization`
- **Path**: `res://scripts/managers/LocalizationManager.gd`
- **Singleton**: ✅ Activado

## 💻 Uso en Godot

### Traducir Textos

```gdscript
# Texto simple
label.text = Localization.tr("login")  # "Iniciar Sesión" / "Login" / "Entrar"

# Texto con argumentos (usa formateo con %)
label.text = Localization.tr("life", [12])  # "Vida: 12" / "Life: 12" / "Vida: 12"
label.text = Localization.tr("turn", [5])   # "Turno: 5" / "Turn: 5" / "Turno: 5"
```

### Cambiar Idioma

```gdscript
# Cambiar a inglés
Localization.set_language(Localization.Languages.EN)

# Cambiar a portugués
Localization.set_language(Localization.Languages.PT)

# Cambiar a español
Localization.set_language(Localization.Languages.ES)
```

### Detectar Cambios de Idioma

```gdscript
func _ready():
    # Conectar señal de cambio de idioma
    Localization.language_changed.connect(_update_texts)
    
func _update_texts(lang_code: String):
    # Actualizar todos los textos
    title_label.text = Localization.tr("my_cards")
    button.text = Localization.tr("back")
```

### Obtener Idioma Actual

```gdscript
var current = Localization.get_language_code()  # "es", "en", o "pt"
```

## 🎮 Ejemplo Completo: Actualizar Escena

```gdscript
extends Control

@onready var title_label = $TitleLabel
@onready var play_button = $PlayButton
@onready var settings_button = $SettingsButton

func _ready():
    # Conectar cambios de idioma
    Localization.language_changed.connect(_update_texts)
    
    # Cargar textos iniciales
    _update_texts(Localization.get_language_code())

func _update_texts(_lang_code: String):
    title_label.text = Localization.tr("play")
    play_button.text = Localization.tr("find_match")
    settings_button.text = Localization.tr("settings")
```

## 📝 Claves de Traducción Disponibles

### UI General
- `loading`, `error`, `success`, `cancel`, `accept`, `back`, `continue`, `close`
- `save`, `delete`, `edit`, `search`, `filter`

### Autenticación
- `login`, `register`, `logout`, `email`, `username`, `password`
- `login_success`, `register_success`, `login_failed`, `register_failed`

### Cartas
- `cards`, `my_cards`, `card_details`
- `attack`, `defense`, `health`, `cosmos`, `cost`, `generate`
- `rarity`, `element`, `faction`, `abilities`, `description`

### Tipos de Carta
- `caballero`, `tecnica`, `objeto`, `escenario`, `ayudante`, `ocasion`

### Rareza
- `comun`, `rara`, `epica`, `legendaria`, `divina`

### Elementos
- `steel`, `fire`, `water`, `earth`, `wind`, `light`, `dark`, `none`

### Mazos
- `decks`, `my_decks`, `create_deck`, `edit_deck`, `delete_deck`
- `deck_name`, `deck_cards`, `add_card`, `remove_card`
- `cards_count` (requiere argumento: `[cantidad, total]`)

### Sobres
- `packs`, `shop`, `buy_pack`, `open_pack`
- `pack_price` (requiere argumento: `[precio]`)
- `pack_purchased`, `pack_opened`

### Partidas
- `play`, `find_match`, `searching`, `match_found`
- `your_turn`, `opponent_turn`, `turn` (requiere argumento: `[número]`)
- `pass_turn`, `surrender`, `victory`, `defeat`, `draw`

### Estados de Juego
- `hand`, `field`, `graveyard`
- `hand_count` (requiere argumento: `[cantidad]`)
- `life` (requiere argumento: `[vida]`)
- `cosmos_count` (requiere argumento: `[cosmos]`)

## 🔧 Backend - Agregar Traducciones de Cartas

### JSON de Ejemplo

```json
{
  "id": "card-uuid-123",
  "card_name": "Pegasus Seiya",
  "translations": [
    {
      "language": "en",
      "name": "Pegasus Seiya",
      "description": "The bronze knight of Pegasus",
      "abilities": {
        "ability-id-1": {
          "name": "Pegasus Meteor Fist",
          "description": "Deals 3 damage to an enemy knight"
        }
      }
    },
    {
      "language": "pt",
      "name": "Seiya de Pégaso",
      "description": "O cavaleiro de bronze de Pégaso",
      "abilities": {
        "ability-id-1": {
          "name": "Meteoro de Pégaso",
          "description": "Causa 3 de dano a um cavaleiro inimigo"
        }
      }
    }
  ]
}
```

### Script de Importación

Actualizar `import-extended-cards.ts` para incluir traducciones:

```typescript
// Después de crear/actualizar la carta
if (cardData.translations) {
  for (const translation of cardData.translations) {
    await CardTranslation.upsert({
      card_id: card.id,
      language: translation.language,
      name: translation.name,
      description: translation.description,
      ability_translations: translation.abilities || {}
    });
  }
}
```

## 📱 API - Obtener Cartas con Traducción

### Endpoint con Parámetro de Idioma

```typescript
// GET /api/cards?lang=en
// GET /api/cards?lang=pt
// GET /api/cards?lang=es (default)

const language = req.query.lang || 'es';

const cards = await Card.findAll({
  include: [
    {
      model: CardTranslation,
      as: 'translations',
      where: { language },
      required: false
    }
  ]
});

// Mapear para usar traducción si existe
const cardsWithTranslation = cards.map(card => {
  const translation = card.translations?.[0];
  return {
    ...card.toJSON(),
    name: translation?.name || card.name,
    description: translation?.description || card.description
  };
});
```

## 🎨 UI - Selector de Idioma

### Agregar a Menú Principal

```gdscript
# En Main.gd o LoginScreen.gd

func _ready():
    var language_button = Button.new()
    language_button.text = "🌍"
    language_button.pressed.connect(_show_language_selector)
    add_child(language_button)

func _show_language_selector():
    var selector = preload("res://scenes/ui/LanguageSelector.tscn").instantiate()
    add_child(selector)
    selector.language_selected.connect(_on_language_changed)

func _on_language_changed(lang_code: String):
    print("Idioma cambiado a: " + lang_code)
    # Actualizar toda la UI
    _update_all_texts()
```

## 🔄 Persistencia

El idioma se guarda automáticamente en `user://settings.cfg`:

```ini
[localization]
language = "en"
```

Al iniciar el juego:
1. Intenta cargar idioma guardado
2. Si no existe, detecta idioma del sistema
3. Si no reconoce el sistema, usa español por defecto

## ✨ Mejores Prácticas

### 1. Siempre usar claves, nunca texto hardcodeado
```gdscript
# ❌ Mal
label.text = "Vida: " + str(vida)

# ✅ Bien
label.text = Localization.tr("life", [vida])
```

### 2. Conectar cambios de idioma en todas las escenas
```gdscript
func _ready():
    Localization.language_changed.connect(_update_texts)
    _update_texts(Localization.get_language_code())
```

### 3. Usar argumentos para textos dinámicos
```gdscript
# En vez de concatenar
label.text = Localization.tr("hand") + ": " + str(count)

# Usar formato
label.text = Localization.tr("hand_count", [count])
```

### 4. Agregar traducciones al crear nuevos textos
Cuando agregues un nuevo texto:
1. Crear clave en español en `LocalizationManager.gd`
2. Agregar traducción en inglés
3. Agregar traducción en portugués

## 🌟 Agregar Nuevo Idioma

Para agregar un cuarto idioma (ej: Francés):

### 1. LocalizationManager.gd
```gdscript
enum Languages {
    ES, EN, PT, FR  # Agregar FR
}

# Agregar diccionario de traducciones
Languages.FR: {
    "login": "Connexion",
    "play": "Jouer",
    # ... más traducciones
}
```

### 2. CardTranslation.ts
```typescript
language!: 'es' | 'en' | 'pt' | 'fr';  // Agregar 'fr'
```

### 3. Migración SQL
```sql
ALTER TYPE enum_card_translations_language ADD VALUE 'fr';
```

## 📊 Resumen de Archivos

| Archivo | Propósito |
|---------|-----------|
| `LocalizationManager.gd` | Singleton con todas las traducciones |
| `LanguageSelector.gd/tscn` | UI para cambiar idioma |
| `CardTranslation.ts` | Modelo de traducciones de cartas |
| `create-card-translations-table.ts` | Migración de BD |
| `GameBoard.gd` | Ejemplo de escena traducida |

## 🎯 Checklist de Implementación

- [x] Crear `LocalizationManager.gd` con 3 idiomas
- [x] Configurar como Autoload `Localization`
- [x] Crear UI selector de idioma
- [x] Actualizar `GameBoard.gd` para usar traducciones
- [x] Crear modelo `CardTranslation`
- [x] Crear migración de tabla
- [x] Agregar relaciones en `associations.ts`
- [ ] Actualizar todas las escenas del juego
- [ ] Modificar endpoints para aceptar parámetro `lang`
- [ ] Importar traducciones de cartas existentes
- [ ] Agregar selector de idioma en LoginScreen
- [ ] Testing en los 3 idiomas
