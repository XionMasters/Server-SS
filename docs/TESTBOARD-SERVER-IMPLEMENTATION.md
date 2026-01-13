# ✅ SERVIDOR - TESTBOARD IMPLEMENTATION COMPLETE

## Resumen Ejecutivo

Se ha implementado completamente en el servidor Node.js/Express todo lo necesario para que TestBoard funcione con el patrón Server-Authoritative.

**Status**: ✅ **SERVIDOR LISTO PARA TESTING**

---

## 🎯 Cambios Realizados

### 1. Ruta HTTP POST /api/match/test

**Archivo**: `src/routes/matches.routes.ts`

```typescript
router.post('/test', matchesController.startTestMatch);
```

**Flujo**:
- Cliente → POST /api/match/test
- Servidor crea Match con TEST mode
- Retorna { match_id, message }
- Cliente sabe que debe conectarse por WebSocket

---

### 2. Controlador startTestMatch

**Archivo**: `src/controllers/matches.controller.ts`

**Responsabilidades**:
1. ✅ Validar que usuario tenga mazo activo
2. ✅ Validar mazo según reglas
3. ✅ Crear Match record con:
   - player1_id = user_id
   - player2_id = user_id (mismo usuario)
   - player1_deck_id = active_deck_id
   - player2_deck_id = active_deck_id
   - phase = "starting"
   - current_player = 1
   - player1_life = 12, player2_life = 12
   - player1_cosmos = 0, player2_cosmos = 0
4. ✅ Llamar initializeMatch() para:
   - Crear CardInPlay records
   - Barajar mazos
   - Robar 7 cartas iniciales

**Retorna HTTP 200**:
```json
{
  "success": true,
  "match_id": "uuid",
  "message": "Partida TEST iniciada"
}
```

---

### 3. WebSocket Handler: request_test_match

**Archivo**: `src/services/websocket.service.ts`

**Case en Switch**:
```typescript
case 'request_test_match':
  await handleRequestTestMatch(ws);
  break;
```

**Función handleRequestTestMatch()**:

Responsabilidades:
1. ✅ Obtener mazo activo del usuario
2. ✅ Validar que existe
3. ✅ Expandir cartas por cantidad (si hay 3x de una carta, repetirla)
4. ✅ Shuffle con Fisher-Yates
5. ✅ Guardar orden barajado en Match.player1_deck_order y player2_deck_order
6. ✅ Crear CardInPlay para todas las cartas:
   - 7 primeras → zone: 'hand'
   - Resto → zone: 'deck'
7. ✅ Cargar info completa de cartas (Card + nombre, type, rarity, etc)
8. ✅ Serializar GameState con formato esperado por cliente
9. ✅ Enviar **match_found** event con GameState completo

**Evento match_found enviado**:
```json
{
  "event": "match_found",
  "data": {
    "id": "match-uuid",
    "match_id": "match-uuid",
    "current_turn": 1,
    "current_player": 1,
    "current_phase": "main",
    "player_number": 1,
    "player1_id": "user-uuid",
    "player2_id": "user-uuid",
    "player1_name": "username",
    "player2_name": "username",
    "player1_life": 12,
    "player2_life": 12,
    "player1_cosmos": 0,
    "player2_cosmos": 0,
    "player1_hand_count": 7,
    "player2_hand_count": 7,
    "player1_deck_size": 33,
    "player2_deck_size": 33,
    "cards_in_play": [
      {
        "id": "cardInPlay-uuid",
        "card_id": "card-uuid",
        "instance_id": "cardInPlay-uuid",
        "player_number": 1,
        "zone": "hand",
        "position": 0,
        "mode": "normal",
        "is_exhausted": false,
        "base_data": {
          "id": "card-uuid",
          "name": "Caballero de Plata",
          "type": "knight",
          "rarity": "common",
          "cost": 2,
          "image_url": "...",
          "description": "..."
        }
      },
      ...
    ]
  }
}
```

---

### 4. WebSocket Handler: declare_attack

**Archivo**: `src/services/websocket.service.ts`

**Case en Switch**:
```typescript
case 'declare_attack':
  await handleDeclareAttack(ws, eventData);
  break;
```

**Función handleDeclareAttack()**:

Responsabilidades:
1. ✅ Validar que es el turno del usuario
2. ✅ Obtener cartas atacante y defensor
3. ✅ Validar que atacante es del usuario
4. ✅ Validar que no atacó aún este turno
5. ✅ Calcular daño: `max(1, attackerAttack - defenderDefense)`
6. ✅ Aplicar daño al defensor
7. ✅ Marcar atacante como "ya atacó"
8. ✅ Si defensor muere, moverlo a graveyard
9. ✅ Broadcast match_update a ambos jugadores

---

### 5. WebSocket Handler: end_turn

**Archivo**: `src/services/websocket.service.ts` (YA EXISTÍA)

**Responsabilidades**:
1. ✅ Cambiar current_player (1→2 o 2→1)
2. ✅ Incrementar current_turn
3. ✅ Dibujar 1 carta para el nuevo jugador
4. ✅ Resetear acciones de turno (has_attacked_this_turn = false)
5. ✅ Broadcast match_update a ambos jugadores

**Evento match_update enviado**:
```json
{
  "event": "match_update",
  "data": {
    "id": "match-uuid",
    "current_turn": 2,
    "current_player": 2,
    "phase": "player2_turn",
    "player1_life": 12,
    "player2_life": 12,
    "player1_cosmos": 0,
    "player2_cosmos": 0,
    "cards_in_play": [
      ...
    ]
  }
}
```

---

### 6. WebSocket Handler: play_card

**Archivo**: `src/services/websocket.service.ts` (YA EXISTÍA)

**Responsabilidades**:
1. ✅ Validar que es el turno del usuario
2. ✅ Validar que tiene suficiente cosmos
3. ✅ Restar cosmos del usuario
4. ✅ Mover carta de hand a zona especificada
5. ✅ Broadcast match_update a ambos jugadores

---

## 📊 Flujo Completo END-TO-END

### Cliente Inicia TEST Match

```
TestBoard.launch_test_match()
  ↓
1. DecksManager.get_active_deck() [HTTP GET /api/decks/active]
  ↓
2. Validar UX mínimo (40-100 cartas)
  ↓
3. CardsManager.preload_deck_images()
  ↓
4. MatchManager.start_test_match()
  ↓
   WebSocketManager.request_test_match()
     ↓
     send_event("request_test_match", {})
```

### Servidor Recibe request_test_match

```
handleRequestTestMatch(ws)
  ↓
1. Obtener mazo activo del usuario
  ↓
2. Expandir cartas (3x = 3 copias)
  ↓
3. Shuffle mazos (Fisher-Yates)
  ↓
4. Crear Match en BD
  ↓
5. Guardar deck_order y deck_index
  ↓
6. Crear CardInPlay (7 mano + resto deck)
  ↓
7. Serializar GameState
  ↓
8. send_event("match_found", gameState)
```

### Cliente Recibe match_found

```
WebSocketManager recibe event "match_found"
  ↓
MatchManager._on_match_found(data)
  ↓
GameState.from_server_data(data)
  ↓
TestBoard._on_match_started(state)
  ↓
render_all_zones()
  ↓
✅ Tablero visible con cartas, vida, cosmos, turno, etc
```

---

## 🔄 Acciones del Jugador

### End Turn

```
Cliente: MatchManager.end_turn()
  ↓
WebSocket: send_event("end_turn", {match_id})
  ↓
Servidor: handleEndTurn(ws, data)
  ✓ Cambiar current_player (1→2)
  ✓ Incrementar current_turn
  ✓ Dibujar 1 carta
  ✓ Resetear estados
  ↓
Broadcast: send_event("match_update", newState) a ambos
  ↓
Cliente: Ambos jugadores reciben actualización
  ↓
TestBoard: render_all_zones() con nuevo estado
```

### Declare Attack

```
Cliente: MatchManager.send_attack(attacker_id, defender_id)
  ↓
WebSocket: send_event("declare_attack", {match_id, attacker_id, defender_id})
  ↓
Servidor: handleDeclareAttack(ws, data)
  ✓ Validar es su turno
  ✓ Calcular daño
  ✓ Aplicar daño
  ✓ Marcar atacante como atacó
  ✓ Si muere, mover a graveyard
  ↓
Broadcast: send_event("match_update", newState) a ambos
```

### Play Card

```
Cliente: MatchManager.play_card(card_id, zone, position)
  ↓
WebSocket: send_event("play_card", {match_id, card_id, zone, position})
  ↓
Servidor: handlePlayCard(ws, data)
  ✓ Validar su turno
  ✓ Validar tiene cosmos suficiente
  ✓ Restar cosmos
  ✓ Mover carta de hand a zona
  ↓
Broadcast: send_event("match_update", newState) a ambos
```

---

## 📋 Datos Persistidos en BD

### Match
- `id` - UUID
- `player1_id` - User UUID
- `player2_id` - User UUID (mismo en TEST)
- `player1_deck_id` - Deck UUID
- `player2_deck_id` - Deck UUID (mismo en TEST)
- `current_turn` - int
- `current_player` - int (1 o 2)
- `phase` - string ('starting', 'player1_turn', 'player2_turn', 'finished')
- `player1_life` - int (12)
- `player2_life` - int (12)
- `player1_cosmos` - int
- `player2_cosmos` - int
- `player1_deck_order` - JSON string de card_ids barajeados
- `player2_deck_order` - JSON string de card_ids barajeados
- `player1_deck_index` - int (posición actual)
- `player2_deck_index` - int (posición actual)
- `started_at` - timestamp
- `finished_at` - timestamp (null hasta que termina)

### CardInPlay
- `id` - UUID
- `match_id` - Match UUID
- `card_id` - Card UUID
- `player_number` - int (1 o 2)
- `zone` - string ('hand', 'deck', 'field_knight', 'field_technique', 'graveyard')
- `position` - int (índice en la zona)
- `current_attack` - int
- `current_defense` - int
- `current_health` - int
- `current_cosmos` - int
- `is_defensive_mode` - bool
- `has_attacked_this_turn` - bool
- `attached_cards` - JSON
- `status_effects` - JSON

---

## 🧪 Testing Checklist

### Setup Previo
- [ ] Servidor corriendo en puerto 3000
- [ ] BD conectada y migrada
- [ ] Usuario creado con al menos 1 mazo
- [ ] Mazo tiene 40+ cartas
- [ ] WebSocket disponible en ws://localhost:3000

### Test Flow

1. **Abrir TestBoard en Godot**
   ```gdscript
   get_tree().change_scene_to_file("res://scenes/game/TestBoard.tscn")
   ```

2. **Click Botón TEST**
   - [ ] Console: `🎭 TEST Match creada`
   - [ ] Console: `📋 Mazo expandido: 40+ cartas`
   - [ ] Console: `🔀 Mazos barajeados`
   - [ ] Console: `✅ cardInPlay records creados`

3. **Esperar WebSocket Response**
   - [ ] Console: `📡 match_found enviada a usuario`
   - [ ] Tardanza: 1-5 segundos

4. **Verificar Renderizado**
   - [ ] Mano visible: 7 cartas
   - [ ] Oponente mano: 7 dorsos
   - [ ] Contador deck: 33 (40-7)
   - [ ] Vida: 12 ambos
   - [ ] Cosmos: 0 ambos
   - [ ] Turno: 1
   - [ ] Jugador: 1

5. **End Turn**
   - [ ] Click botón "End Turn"
   - [ ] Esperar 1-3 segundos
   - [ ] Verificar:
     - Turno → 2
     - Jugador actual → 2 (oponente)
     - P2 robó 1 carta más
     - P1 mano sigue igual

6. **Status Codes**
   - [ ] 400 = No tienes mazo activo
   - [ ] 400 = Mazo no cumple reglas
   - [ ] 200 = Success
   - [ ] Error event = Algo fallóen servidor

---

## 🔍 Debug Points

### Server Logs a Buscar

```bash
# Inicio de TEST match
🎭 TEST Match creada: {match-id}

# Expansión de cartas
📋 Mazo expandido: 40 cartas

# Shuffle
🔀 Mazos barajeados

# Creación de cartas en juego
✅ 80 cartas en juego creadas

# Respuesta WebSocket
📡 match_found enviada a {username}
```

### Errores Comunes

**❌ "No tienes un mazo activo"**
- Usuario no tiene deck
- Deck no está marcado como is_active=true
- Solución: Crear/marcar deck en CollectionScreen

**❌ "Tu mazo activo no cumple con las reglas"**
- Mazo < 40 cartas
- Mazo > 100 cartas
- Cartas duplicadas fuera de límite
- Solución: Verificar validateExistingDeck()

**❌ WebSocket timeout (30s+ sin respuesta)**
- Servidor no está corriendo
- WebSocket no inicializado
- Error en handleRequestTestMatch
- Solución: Revisar logs del servidor

**❌ "Usuario no encontrado"**
- User no existe
- Token inválido
- Solución: Verificar autenticación

---

## 📚 Archivos Modificados

```
✅ src/routes/matches.routes.ts
   - Agregó: router.post('/test', matchesController.startTestMatch)

✅ src/controllers/matches.controller.ts
   - Agregó: startTestMatch() async function
   - Reutiliza: validateExistingDeck(), initializeMatch()

✅ src/services/websocket.service.ts
   - Agregó case: 'request_test_match'
   - Agregó function: handleRequestTestMatch()
   - Agregó case: 'declare_attack'
   - Agregó function: handleDeclareAttack()
```

---

## 🎯 Próximas Optimizaciones

1. **Validación de Mazo Más Estricta**
   - Limites de copias por raridad
   - Balance de tipos de cartas
   - Restricciones especiales por efecto

2. **Blockchain/Anti-Cheat**
   - Validar cada acción en servidor
   - Hash de decisiones
   - Replay protection

3. **Estadísticas**
   - Guardar acciones en MatchAction
   - Calcular win/loss stats
   - Replay de partidas

4. **AI Opponent**
   - Reemplazar player2_id con IA
   - Turnos automáticos
   - Decisiones inteligentes

---

## ✅ Conclusión

**Servidor completamente implementado para TestBoard**:
- ✅ POST /api/match/test endpoint
- ✅ WebSocket request_test_match handler
- ✅ GameState initialization
- ✅ Shuffle & draw implementation
- ✅ declare_attack handler
- ✅ end_turn handler
- ✅ match_update broadcasts
- ✅ Error handling & validation

**Estado**: ✅ LISTO PARA TESTING CON CLIENTE

---

**Última Actualización**: Diciembre 22, 2025  
**Versión**: 1.0 - Backend Ready  
**Status**: ✅ Implementación completada

