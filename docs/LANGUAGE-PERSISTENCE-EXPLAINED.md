# 🔄 Persistencia del Idioma - Explicación Detallada

## 📌 Resumen Simple

El sistema guarda el idioma elegido por el usuario en un archivo de configuración en el disco. La próxima vez que abra el juego, carga ese idioma automáticamente.

## 🗂️ ¿Dónde se guarda?

Godot usa una carpeta especial llamada `user://` que se traduce a:

```
Windows: C:\Users\[TuUsuario]\AppData\Roaming\Godot\app_userdata\[NombreDelProyecto]\
Linux:   ~/.local/share/godot/app_userdata/[NombreDelProyecto]/
macOS:   ~/Library/Application Support/Godot/app_userdata/[NombreDelProyecto]/
```

Dentro se crea el archivo: **`settings.cfg`**

## 📄 Contenido del Archivo

El archivo `settings.cfg` tiene este formato (INI):

```ini
[localization]
language = "en"
```

Si el usuario elige **Español**: `language = "es"`
Si el usuario elige **Português**: `language = "pt"`

## 🔄 Flujo Completo

### 1️⃣ Primera vez que abre el juego

```
Usuario abre el juego
    ↓
LocalizationManager._ready() se ejecuta
    ↓
Llama a load_saved_language()
    ↓
Intenta cargar "user://settings.cfg"
    ↓
¿El archivo existe?
    ├─ NO → Detecta idioma del sistema (OS.get_locale())
    │        Ejemplo: Si Windows está en inglés → "en"
    │        Si está en español → "es"
    │        Usa ese idioma
    │
    └─ SÍ → Lee el archivo y carga el idioma guardado
```

### 2️⃣ Usuario cambia el idioma

```
Usuario abre selector de idioma
    ↓
Elige "English"
    ↓
Llama a Localization.set_language(Languages.EN)
    ↓
Actualiza: current_language = Languages.EN
    ↓
Llama a save_language()
    ↓
Crea/actualiza "user://settings.cfg"
    ↓
Escribe: [localization]\nlanguage = "en"
    ↓
Emite señal language_changed.emit("en")
    ↓
Todas las escenas actualizan sus textos
```

### 3️⃣ Usuario cierra y vuelve a abrir el juego

```
Usuario abre el juego nuevamente
    ↓
LocalizationManager._ready() se ejecuta
    ↓
Llama a load_saved_language()
    ↓
Carga "user://settings.cfg"
    ↓
Lee: language = "en"
    ↓
Establece: current_language = Languages.EN
    ↓
El juego arranca directamente en inglés ✅
```

## 💻 Código Explicado Paso a Paso

### Función: `save_language()`

```gdscript
func save_language():
    # 1. Crear objeto para manejar archivos de configuración
    var config = ConfigFile.new()
    
    # 2. Establecer un valor en la sección "localization", clave "language"
    #    Valor: código del idioma actual ("es", "en", o "pt")
    config.set_value("localization", "language", get_language_code())
    
    # 3. Guardar en disco en la ruta "user://settings.cfg"
    #    Godot automáticamente traduce "user://" a la carpeta de usuario
    config.save("user://settings.cfg")
```

**Resultado en disco:**
```ini
[localization]
language = "en"
```

### Función: `load_saved_language()`

```gdscript
func load_saved_language():
    # 1. Crear objeto para leer archivos de configuración
    var config = ConfigFile.new()
    
    # 2. Intentar cargar el archivo
    var err = config.load("user://settings.cfg")
    
    # 3. Verificar si la carga fue exitosa
    if err == OK:
        # ✅ Archivo existe y se cargó correctamente
        
        # 4. Leer el valor de la clave "language" en sección "localization"
        #    Si no existe, usar "es" por defecto
        var lang_code = config.get_value("localization", "language", "es")
        
        # 5. Convertir código ("en") a enum (Languages.EN)
        current_language = get_language_from_code(lang_code)
    else:
        # ❌ Archivo no existe (primera vez)
        
        # 6. Detectar idioma del sistema operativo
        #    OS.get_locale() devuelve algo como "es_ES", "en_US", "pt_BR"
        #    .split("_")[0] toma solo la primera parte: "es", "en", "pt"
        var system_locale = OS.get_locale().split("_")[0]
        
        # 7. Usar el idioma del sistema
        current_language = get_language_from_code(system_locale)
```

### Función: `get_language_from_code()`

```gdscript
func get_language_from_code(code: String) -> Languages:
    # Convertir string a minúsculas para evitar problemas
    match code.to_lower():
        "en":
            return Languages.EN    # Inglés
        "pt":
            return Languages.PT    # Portugués
        _:  # Cualquier otro caso (incluyendo "es")
            return Languages.ES    # Español (por defecto)
```

## 🔍 Ejemplo Práctico

### Escenario 1: Usuario en Windows (Español)

**Primera vez:**
```
1. Usuario abre el juego
2. LocalizationManager detecta: OS.get_locale() = "es_ES"
3. Extrae: "es"
4. Establece: current_language = Languages.ES
5. NO guarda archivo aún (solo detecta)
6. Juego muestra textos en español
```

**Usuario cambia a inglés:**
```
1. Usuario abre selector de idioma
2. Selecciona "English"
3. Se ejecuta: Localization.set_language(Languages.EN)
4. Se llama: save_language()
5. Se crea archivo: user://settings.cfg
   [localization]
   language = "en"
6. Todos los textos cambian a inglés inmediatamente
```

**Usuario cierra y reabre:**
```
1. Usuario abre el juego
2. LocalizationManager carga: user://settings.cfg
3. Lee: language = "en"
4. Establece: current_language = Languages.EN
5. Juego arranca directamente en inglés ✅
```

### Escenario 2: Usuario en Windows (Inglés) - Primera vez

```
1. Usuario abre el juego
2. LocalizationManager detecta: OS.get_locale() = "en_US"
3. Extrae: "en"
4. Establece: current_language = Languages.EN
5. Juego muestra textos en inglés directamente
```

## 🛠️ Funciones de ConfigFile

Godot usa la clase `ConfigFile` que es similar a archivos INI:

```gdscript
var config = ConfigFile.new()

# Guardar valores
config.set_value("seccion", "clave", "valor")
config.save("user://archivo.cfg")

# Cargar valores
var err = config.load("user://archivo.cfg")
if err == OK:
    var valor = config.get_value("seccion", "clave", "default")
```

## 📊 Diagrama de Estados

```
┌─────────────────────────────────────────────────────────────┐
│                     INICIO DEL JUEGO                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ load_saved_language()│
              └──────────┬───────────┘
                         │
                ┌────────▼────────┐
                │ ¿Existe archivo?│
                └────┬───────┬────┘
                     │       │
                 NO  │       │  SÍ
                     │       │
      ┌──────────────▼─┐   ┌─▼──────────────────┐
      │ Detectar idioma│   │ Leer archivo .cfg  │
      │   del sistema  │   │ language = "en"    │
      └──────────────┬─┘   └─┬──────────────────┘
                     │       │
                     └───┬───┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Establecer idioma    │
              │ current_language     │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │ Juego usa ese idioma │
              └──────────────────────┘
```

## 🎮 Integración con el Juego

### En el _ready() del LocalizationManager:

```gdscript
func _ready():
    load_translations()      # Cargar todos los diccionarios
    load_saved_language()    # ← Aquí se carga la preferencia guardada
```

### Cuando el usuario cambia idioma:

```gdscript
func set_language(lang: Languages):
    if lang != current_language:
        current_language = lang
        save_language()      # ← Aquí se guarda en disco
        language_changed.emit(get_language_code())  # Notifica a todas las escenas
```

## 🔐 Persistencia Garantizada

El archivo se guarda **automáticamente** cada vez que:
1. Usuario cambia idioma manualmente
2. Se llama a `Localization.set_language()`

El archivo se carga **automáticamente** cuando:
1. El juego inicia
2. LocalizationManager se inicializa (`_ready()`)

## 🧪 Cómo Probar

### Verificar que se guarde:

```gdscript
# En cualquier script
func _ready():
    # Cambiar a inglés
    Localization.set_language(Localization.Languages.EN)
    
    # Verificar ubicación del archivo
    print("Archivo guardado en: ", OS.get_user_data_dir())
```

### Ver el contenido:

1. Ejecutar el juego
2. Cambiar idioma a inglés
3. Cerrar el juego
4. Ir a: `C:\Users\[TuUsuario]\AppData\Roaming\Godot\app_userdata\[Proyecto]\`
5. Abrir `settings.cfg` con bloc de notas

### Verificar que se cargue:

```gdscript
# En cualquier script
func _ready():
    await get_tree().create_timer(1.0).timeout
    print("Idioma actual:", Localization.get_language_code())
    # Debe mostrar el idioma que elegiste la última vez
```

## ❓ Preguntas Frecuentes

### ¿Qué pasa si borro el archivo settings.cfg?
El juego detectará el idioma del sistema operativo la próxima vez que se abra.

### ¿Puedo cambiar la ubicación del archivo?
Sí, pero se recomienda usar `user://` porque Godot lo gestiona automáticamente según el OS.

### ¿El archivo se sincroniza en la nube?
No automáticamente. Depende del sistema operativo (ej: si usas Steam Cloud).

### ¿Puedo guardar otras preferencias ahí?
¡Sí! Puedes agregar más valores:
```gdscript
config.set_value("audio", "volume", 0.8)
config.set_value("graphics", "fullscreen", true)
config.set_value("localization", "language", "en")
```

## 📚 Resumen Final

**Persistencia = Guardar + Cargar**

1. **Guardar**: `ConfigFile.save("user://settings.cfg")`
   - Se ejecuta cuando usuario cambia idioma
   - Escribe archivo INI en disco

2. **Cargar**: `ConfigFile.load("user://settings.cfg")`
   - Se ejecuta al inicio del juego
   - Lee archivo INI del disco

3. **Resultado**: El idioma se mantiene entre sesiones ✅

El sistema es **completamente automático** para el usuario. Solo elige una vez y se guarda para siempre.
