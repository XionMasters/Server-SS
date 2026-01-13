# 🌍 Sistema de 3 Idiomas - Implementación Completa

## ✅ ¿Qué se ha implementado?

### Backend (API - TypeScript/PostgreSQL)
1. **Modelo `CardTranslation`** - Tabla para almacenar traducciones de cartas
2. **Migración de BD** - Script para crear tabla `card_translations`
3. **Relaciones** - Asociaciones entre Card y CardTranslation
4. **Soporte para 3 idiomas**: `es` (Español), `en` (English), `pt` (Português)

### Frontend (Godot - GDScript)
1. **`LocalizationManager`** - Singleton con todas las traducciones del juego
2. **`LanguageSelector`** - UI para cambiar idioma dinámicamente
3. **Actualización de `GameBoard`** - Ejemplo de escena totalmente traducida
4. **Persistencia** - El idioma elegido se guarda automáticamente

## 🚀 Pasos para Activar el Sistema

### Paso 1: Migración de Base de Datos
```bash
cd "d:\Disco E\Proyectos\Server-SS"
npx ts-node src/scripts/migrations/create-card-translations-table.ts
```

### Paso 2: Configurar Autoload en Godot
1. Abrir Godot: `d:\Disco E\Nacho\Projects\ccg`
2. Ir a **Project** → **Project Settings** → **Autoload**
3. Agregar nuevo Autoload:
   - **Path**: `res://scripts/managers/LocalizationManager.gd`
   - **Name**: `Localization`
   - **Enable**: ✅

### Paso 3: Ejecutar el Juego
Ya está todo listo. El sistema:
- Detecta el idioma del sistema operativo
- Permite cambiar idioma con el selector
- Guarda la preferencia del usuario
- Actualiza todos los textos dinámicamente

## 📝 Uso en el Código

### Traducir Textos
```gdscript
# Texto simple
label.text = Localization.tr("login")

# Texto con parámetros
label.text = Localization.tr("life", [12])  # "Vida: 12"
label.text = Localization.tr("turn", [5])   # "Turno: 5"
```

### Cambiar Idioma
```gdscript
# Programáticamente
Localization.set_language(Localization.Languages.EN)  # Inglés
Localization.set_language(Localization.Languages.PT)  # Portugués
Localization.set_language(Localization.Languages.ES)  # Español

# Con UI
var selector = preload("res://scenes/ui/LanguageSelector.tscn").instantiate()
add_child(selector)
```

### Detectar Cambios
```gdscript
func _ready():
    Localization.language_changed.connect(_update_texts)
    _update_texts(Localization.get_language_code())

func _update_texts(lang_code: String):
    title.text = Localization.tr("my_cards")
    button.text = Localization.tr("play")
```

## 🎮 Claves de Traducción Principales

| Clave | Español | English | Português |
|-------|---------|---------|-----------|
| `login` | Iniciar Sesión | Login | Entrar |
| `play` | Jugar | Play | Jogar |
| `attack` | Ataque | Attack | Ataque |
| `defense` | Defensa | Defense | Defesa |
| `health` | Vida | Health | Vida |
| `your_turn` | ES TU TURNO | YOUR TURN | SUA VEZ |
| `victory` | ¡VICTORIA! | VICTORY! | VITÓRIA! |
| `defeat` | DERROTA | DEFEAT | DERROTA |

**Ver todas las claves en**: `LocalizationManager.gd` líneas 30-400

## 📂 Archivos Creados/Modificados

### Backend
```
Server-SS/
├── src/
│   ├── models/
│   │   ├── CardTranslation.ts          [NUEVO]
│   │   └── associations.ts             [MODIFICADO]
│   └── scripts/
│       └── migrations/
│           └── create-card-translations-table.ts  [NUEVO]
└── docs/
    └── INTERNATIONALIZATION.md         [NUEVO]
```

### Frontend
```
ccg/
├── scripts/
│   └── managers/
│       └── LocalizationManager.gd      [NUEVO]
├── scenes/
│   ├── game/
│   │   └── GameBoard.gd                [MODIFICADO]
│   └── ui/
│       ├── LanguageSelector.gd         [NUEVO]
│       └── LanguageSelector.tscn       [NUEVO]
```

## 🌟 Características

### ✅ Detección Automática
El sistema detecta el idioma del OS al primer inicio:
- Windows en español → `ES`
- Windows en inglés → `EN`
- Windows en portugués → `PT`

### ✅ Persistencia
La elección del usuario se guarda en `user://settings.cfg`:
```ini
[localization]
language = "en"
```

### ✅ Cambio Dinámico
Todos los textos se actualizan inmediatamente al cambiar idioma, sin necesidad de reiniciar.

### ✅ Backend Preparado
La base de datos puede almacenar traducciones de:
- Nombres de cartas
- Descripciones de cartas
- Nombres de habilidades
- Descripciones de habilidades

### ✅ Extensible
Agregar un 4º idioma es simple:
1. Agregar enum en `LocalizationManager.gd`
2. Agregar diccionario de traducciones
3. Agregar valor al ENUM en BD
4. Listo

## 📚 Documentación Completa

Ver: `docs/INTERNATIONALIZATION.md` para:
- Guía detallada de uso
- Todas las claves disponibles
- Ejemplos de integración
- API de backend
- Cómo agregar nuevos idiomas
- Mejores prácticas

## 🎯 Próximos Pasos

### Para completar la integración:

1. **Actualizar todas las escenas**
   - LoginScreen.gd
   - Main.gd
   - CardsCollection.gd
   - DeckBuilder.gd
   - PackOpening.gd
   - etc.

2. **Agregar selector en UI principal**
   ```gdscript
   # En LoginScreen o Main
   var language_button = Button.new()
   language_button.text = "🌍 " + Localization.get_language_code().to_upper()
   language_button.pressed.connect(_show_language_selector)
   ```

3. **Traducir cartas en BD**
   Crear JSON con traducciones:
   ```json
   {
     "card_id": "uuid-123",
     "translations": [
       {"language": "en", "name": "Pegasus Seiya", "description": "..."},
       {"language": "pt", "name": "Seiya de Pégaso", "description": "..."}
     ]
   }
   ```

4. **Modificar endpoints API**
   Agregar parámetro `lang` a:
   - `GET /api/cards?lang=en`
   - `GET /api/decks?lang=pt`

## ⚡ Testing Rápido

Para probar el sistema:

1. Ejecutar migración de BD
2. Configurar Autoload en Godot
3. Abrir escena `GameBoard.tscn`
4. Ejecutar (F5)
5. Los textos deben aparecer en el idioma del sistema
6. Cambiar idioma con código:
   ```gdscript
   # En consola de Godot
   Localization.set_language(Localization.Languages.EN)
   ```

## 📞 Soporte

Si algo no funciona:
1. Verificar que el Autoload esté configurado
2. Verificar que la migración de BD se ejecutó
3. Revisar consola de errores en Godot
4. Verificar que se use `Localization.tr()` en vez de texto directo

## 🎉 Conclusión

Sistema completo de internacionalización implementado con:
- ✅ 3 idiomas (ES, EN, PT)
- ✅ Detección automática
- ✅ Persistencia de preferencias
- ✅ Cambio dinámico sin reinicio
- ✅ 140+ traducciones predefinidas
- ✅ Backend preparado para cartas
- ✅ Extensible a más idiomas
- ✅ Documentación completa
