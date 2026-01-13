# Sistema de Validación de Partidas

## Descripción General

El sistema de validación de partidas garantiza que los jugadores solo puedan buscar partida si tienen un mazo válido y correctamente configurado.

## Flujo de Validación

### 1. Verificación Previa (GET /matches/can-search)

Antes de mostrar el botón de "Buscar Partida" habilitado, el cliente verifica:

```
GET /api/matches/can-search
Authorization: Bearer <token>
```

**Respuesta Exitosa:**
```json
{
  "can_search": true,
  "reason": "OK",
  "message": "Listo para buscar partida",
  "deck": {
    "id": "uuid",
    "name": "Mi Mazo de Bronces",
    "total_cards": 45
  },
  "warnings": [
    "Deck tiene pocas cartas de tipo 'caballero'"
  ]
}
```

**Respuesta - Sin Deck Activo:**
```json
{
  "can_search": false,
  "reason": "NO_ACTIVE_DECK",
  "message": "No tienes un mazo marcado como activo",
  "deck": null
}
```

**Respuesta - Deck Inválido:**
```json
{
  "can_search": false,
  "reason": "INVALID_DECK",
  "message": "Tu mazo activo no cumple con las reglas",
  "deck": {
    "id": "uuid",
    "name": "Mi Mazo"
  },
  "errors": [
    "Deck debe tener entre 40 y 50 cartas (actualmente: 35)",
    "Demasiadas copias de 'Seiya de Pegaso': 2 (máximo: 1)"
  ],
  "warnings": []
}
```

### 2. Búsqueda de Partida (POST /matches/find)

Cuando el jugador presiona "Buscar Partida", se valida nuevamente en el servidor:

```
POST /api/matches/find
Authorization: Bearer <token>
```

**Validaciones realizadas:**
1. ✅ Usuario tiene un deck marcado como `is_active: true`
2. ✅ Deck tiene entre 40 y 50 cartas
3. ✅ Deck respeta límites de `max_copies` por carta
4. ✅ Cartas únicas (`unique: true`) tienen máximo 1 copia
5. ✅ Deck cumple con restricciones de tipos (opcional)

**Respuesta Exitosa - Esperando Oponente:**
```json
{
  "id": "match-uuid",
  "player1_id": "user-uuid",
  "player2_id": "user-uuid",
  "player1_deck_id": "deck-uuid",
  "player2_deck_id": "deck-uuid",
  "phase": "waiting",
  "created_at": "2024-01-20T15:00:00Z"
}
```

**Respuesta Exitosa - Partida Encontrada:**
```json
{
  "id": "match-uuid",
  "player1_id": "user1-uuid",
  "player2_id": "user2-uuid",
  "phase": "starting",
  "started_at": "2024-01-20T15:00:05Z"
}
```

**Error - Sin Deck Activo:**
```json
{
  "error": "No tienes un mazo activo. Marca un mazo como activo primero.",
  "code": "NO_ACTIVE_DECK"
}
```

**Error - Deck Inválido:**
```json
{
  "error": "Tu mazo activo no cumple con las reglas del juego",
  "code": "INVALID_DECK",
  "deck_name": "Mi Mazo",
  "validation_errors": [
    "Deck debe tener entre 40 y 50 cartas (actualmente: 35)"
  ],
  "validation_warnings": [
    "Deck tiene muy pocas cartas de tipo 'caballero'"
  ]
}
```

## Reglas de Validación

### Reglas Obligatorias (Errores)

1. **Tamaño del Deck**
   - Mínimo: 40 cartas
   - Máximo: 50 cartas

2. **Límite de Copias**
   - Por defecto: 3 copias máximo por carta
   - Cartas con `max_copies` específico: respeta ese límite
   - Cartas únicas (`unique: true`): 1 copia máxima

3. **Deck Activo**
   - Exactamente 1 deck debe tener `is_active: true`

### Reglas Recomendadas (Advertencias)

1. **Composición de Tipos**
   - Mínimo 15 cartas de tipo `caballero` (recomendado)
   - Máximo 10 cartas legendarias (recomendado)

2. **Balance de Poder**
   - `power_level` promedio < 7 (recomendado)

## Implementación en Godot

### MatchSearch.gd

```gdscript
func _ready():
    # Verificar estado del deck al cargar
    MatchManager.check_can_search_match()

func _on_deck_check_completed(result: Dictionary):
    can_search = result.get("can_search", false)
    
    if can_search:
        search_button.disabled = false
        status_label.text = "Listo para buscar partida"
        deck_info_label.text = "Mazo: %s" % result.deck.name
    else:
        search_button.disabled = true
        
        if result.reason == "NO_ACTIVE_DECK":
            status_label.text = "❌ Sin mazo activo"
            deck_info_label.text = "Ve a 'Mazos' y marca uno como activo"
        elif result.reason == "INVALID_DECK":
            status_label.text = "❌ Mazo inválido"
            deck_info_label.text = result.errors[0] if result.errors.size() > 0 else ""
```

### MatchManager.gd

```gdscript
signal deck_check_completed(result: Dictionary)

func check_can_search_match():
    var http = HTTPRequest.new()
    add_child(http)
    http.request_completed.connect(_on_can_search_check_completed)
    
    var headers = AuthManager.get_auth_headers()
    http.request(API_URL + "/can-search", headers)

func _on_can_search_check_completed(result, response_code, headers, body):
    var json = JSON.new()
    json.parse(body.get_string_from_utf8())
    deck_check_checked_completed.emit(json.data)
```

## Mensajes de Error Personalizados

### Backend (matches.controller.ts)

```typescript
if (!activeDeck) {
  return res.status(400).json({ 
    error: 'No tienes un mazo activo. Marca un mazo como activo primero.',
    code: 'NO_ACTIVE_DECK'
  });
}

if (!validation.valid) {
  return res.status(400).json({
    error: 'Tu mazo activo no cumple con las reglas del juego',
    code: 'INVALID_DECK',
    deck_name: activeDeck.name,
    validation_errors: validation.errors,
    validation_warnings: validation.warnings
  });
}
```

### Frontend (MatchManager.gd)

```gdscript
if error_code == "NO_ACTIVE_DECK":
    error_msg = "No tienes un mazo activo.\nVe a 'Mazos' y marca uno como activo."
elif error_code == "INVALID_DECK":
    var deck_name = data.get("deck_name", "tu mazo")
    var errors = data.get("validation_errors", [])
    if errors.size() > 0:
        error_msg = "Mazo '%s' inválido:\n%s" % [deck_name, errors[0]]
```

## Casos de Uso

### 1. Jugador Nuevo (Sin Decks)

1. Accede a "Buscar Partida"
2. Ve mensaje: "❌ Sin mazo activo"
3. Se le indica ir a "Mazos" y crear/marcar uno

### 2. Deck Incompleto (< 40 cartas)

1. Intenta buscar partida
2. Ve mensaje: "❌ Mazo 'Mi Deck' inválido"
3. Detalle: "Deck debe tener entre 40 y 50 cartas (actualmente: 35)"
4. Debe volver a DeckBuilder y agregar cartas

### 3. Deck con Copias Excesivas

1. Intenta buscar partida
2. Ve error: "Demasiadas copias de 'Seiya de Pegaso': 2 (máximo: 1)"
3. Debe ajustar el deck para cumplir con límites

### 4. Deck Válido con Advertencias

1. Verificación muestra: "✅ Listo para buscar partida"
2. Advertencia: "⚠ Deck tiene pocas cartas de tipo 'caballero'"
3. Puede buscar partida de todas formas
4. Recomendación de mejorar balance

### 5. Búsqueda Exitosa

1. Deck válido ✅
2. Presiona "Buscar Partida"
3. Estados:
   - "Buscando partida..." (enviando request)
   - "Esperando oponente..." (waiting phase)
   - "¡Partida encontrada!" (match found)
4. Carga GameBoard.tscn

## Endpoints Relacionados

- `GET /api/matches/can-search` - Verificación previa
- `POST /api/matches/find` - Buscar partida
- `GET /api/decks/:id/validate` - Validar deck específico
- `PUT /api/decks/:id` - Marcar deck como activo (`is_active: true`)

## Diagrama de Flujo

```
[Jugador] → [MatchSearch.tscn]
    ↓
[_ready()] → check_can_search_match()
    ↓
[GET /matches/can-search]
    ↓
┌───────────────────────────────┐
│ can_search: true?             │
├───────────────────────────────┤
│ YES → Habilitar botón         │
│ NO  → Deshabilitar botón      │
│       Mostrar error/guía      │
└───────────────────────────────┘
    ↓
[Jugador presiona "Buscar"]
    ↓
[POST /matches/find]
    ↓
┌───────────────────────────────┐
│ Validar deck activo           │
│ Validar reglas (40-50 cartas) │
│ Validar max_copies            │
└───────────────────────────────┘
    ↓
┌───────────────────────────────┐
│ Válido?                       │
├───────────────────────────────┤
│ YES → Crear/unir match        │
│ NO  → Error 400 + detalles    │
└───────────────────────────────┘
```

## Testing

### Probar Validación Previa

```bash
# Con deck activo válido
curl http://localhost:3000/api/matches/can-search \
  -H "Authorization: Bearer <token>"

# Respuesta esperada: can_search: true
```

### Probar Sin Deck Activo

```bash
# Desactivar todos los decks primero
curl -X PUT http://localhost:3000/api/decks/<id> \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false}'

# Intentar verificar
curl http://localhost:3000/api/matches/can-search \
  -H "Authorization: Bearer <token>"

# Respuesta esperada: can_search: false, reason: "NO_ACTIVE_DECK"
```

### Probar Deck Inválido

```bash
# Deck con < 40 cartas
curl http://localhost:3000/api/matches/can-search \
  -H "Authorization: Bearer <token>"

# Respuesta esperada: can_search: false, reason: "INVALID_DECK"
```

## Mejoras Futuras

1. **Caché de Validación**
   - Cachear resultado de validación por 5 minutos
   - Invalidar al modificar deck

2. **Validación Asíncrona**
   - Validar en segundo plano mientras el jugador está en el menú
   - Mostrar notificación si el deck activo se vuelve inválido

3. **Sugerencias Automáticas**
   - "Necesitas 5 cartas más para completar tu deck"
   - "Recomendamos agregar más caballeros"

4. **Presets de Decks**
   - Decks pre-construidos válidos para nuevos jugadores
   - Un clic para tener deck funcional

5. **Validación en Tiempo Real**
   - Mostrar validación mientras edita el deck
   - Indicador visual de "Listo para jugar"
