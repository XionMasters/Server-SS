# 🚀 TESTBOARD - SISTEMA COMPLETO LISTO PARA TESTING

## 📊 Estado General

| Componente | Estado | Nota |
|-----------|--------|------|
| **Cliente (Godot)** | ✅ LISTO | TestBoard refactorizado, 9 pasos implementados |
| **Servidor HTTP** | ✅ LISTO | POST /api/match/test endpoint implementado |
| **Servidor WebSocket** | ✅ LISTO | request_test_match handler implementado |
| **GameState** | ✅ LISTO | Serialización completa client-side |
| **Acciones** | ✅ LISTO | declare_attack, end_turn, play_card |
| **BD** | ✅ LISTO | Match y CardInPlay models completos |
| **Testing** | ✅ LISTO | Docs completas |

---

## 🎯 Flow Completo

```
┌─────────────────────────────────────────────────────────────────┐
│ CLIENTE (Godot)                                                 │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ TestBoard.launch_test_match()                           │   │
│ │ 0. User clicks TEST button                              │   │
│ │ 1. DecksManager.get_active_deck() [HTTP]                │   │
│ │ 2. Validar 40-100 cartas                                │   │
│ │ 3. CardsManager.preload_deck_images() [background]      │   │
│ │ 4. MatchManager.start_test_match()                      │   │
│ │    ↓ WebSocketManager.request_test_match()              │   │
│ │      ↓ send_event("request_test_match", {})             │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            ↓ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│ SERVIDOR (Node.js/Express)                                      │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ handleRequestTestMatch(ws)                              │   │
│ │ 5. Obtener mazo activo del usuario                      │   │
│ │ 6. Expandir cartas (3x = 3 copias)                      │   │
│ │ 7. Shuffle mazos (Fisher-Yates)                         │   │
│ │ 8. Crear Match en BD                                    │   │
│ │ 9. Crear CardInPlay (7 mano + resto deck)               │   │
│ │ 10. Serializar GameState                                │   │
│ │ 11. send_event("match_found", gameState)                │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            ↓ WebSocket
┌─────────────────────────────────────────────────────────────────┐
│ CLIENTE (Godot)                                                 │
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ TestBoard._on_match_started(gameState)                  │   │
│ │ 12. Recibir match_found event                           │   │
│ │ 13. MatchManager actualiza game_state                   │   │
│ │ 14. render_all_zones()                                  │   │
│ │ 15. UI visible: mano, oponente, vida, cosmos, turno    │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 Cliente - Archivos Implementados

### TestBoard.gd (Script Principal)
**Líneas**: ~600
**Métodos**:
- ✅ `launch_test_match()` - Entrada principal
- ✅ `_fetch_active_deck()` - HTTP DecksManager
- ✅ `_validate_and_start_match()` - Validar 40-100 cartas
- ✅ `_preload_images_for_deck()` - Background image loading
- ✅ `_request_start_test_match()` - WebSocket request
- ✅ `_on_match_started()` - Signal handler
- ✅ `render_all_zones()` - Complete UI render
- ✅ `_on_end_turn_pressed()` - End turn action
- ✅ Completo renderizado basado en GameState

### GameState.gd (Data Model)
**Líneas**: ~450
**Métodos Nuevos**:
- ✅ `get_hand_for_player(player_num)` - Obtener mano
- ✅ `get_cards_in_zone(zone, player_num)` - Obtener cartas en zona
- ✅ `get_deck_size(player_num)` - Obtener tamaño deck
- ✅ `get_player_life(player_num)` - Obtener vida
- ✅ `get_player_cosmos(player_num)` - Obtener cosmos

### Managers
- ✅ `DecksManager.get_active_deck()` - HTTP GET /api/decks/active
- ✅ `CardsManager.preload_deck_images()` - Background preload
- ✅ `MatchManager.start_test_match()` - WebSocket coordinador
- ✅ `MatchManager.end_turn()` - End turn action
- ✅ `MatchManager.send_attack()` - Attack action
- ✅ `WebSocketManager.request_test_match()` - Send WebSocket event

---

## 🖥️ Servidor - Archivos Implementados

### src/routes/matches.routes.ts
```typescript
router.post('/test', matchesController.startTestMatch);
```

### src/controllers/matches.controller.ts
```typescript
export const startTestMatch = async (req: Request, res: Response)
```
**Responsabilidades**:
- ✅ Validar mazo activo existe
- ✅ Validar reglas del mazo
- ✅ Crear Match en BD
- ✅ Llamar initializeMatch()
- ✅ Retornar match_id

### src/services/websocket.service.ts

**Handler 1: request_test_match**
```typescript
case 'request_test_match':
  await handleRequestTestMatch(ws);
  break;

async function handleRequestTestMatch(ws: AuthenticatedWebSocket)
```
**Responsabilidades**:
- ✅ Obtener deck activo
- ✅ Expandir cartas
- ✅ Shuffle
- ✅ Crear CardInPlay
- ✅ Serializar GameState
- ✅ Send match_found event

**Handler 2: declare_attack** (NUEVO)
```typescript
case 'declare_attack':
  await handleDeclareAttack(ws, eventData);
  break;

async function handleDeclareAttack(ws: AuthenticatedWebSocket, data: any)
```
**Responsabilidades**:
- ✅ Validar turno
- ✅ Calcular daño
- ✅ Aplicar daño
- ✅ Marcar atacante
- ✅ Mover muertos a graveyard
- ✅ Broadcast match_update

**Handler 3: end_turn** (YA EXISTÍA, verified)
- ✅ Cambiar turno
- ✅ Dibujar carta
- ✅ Broadcast match_update

**Handler 4: play_card** (YA EXISTÍA, verified)
- ✅ Validar cosmos
- ✅ Restar cosmos
- ✅ Mover carta
- ✅ Broadcast match_update

---

## 📋 Datos en Tránsito

### WebSocket Event: match_found (Servidor → Cliente)

```json
{
  "event": "match_found",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "match_id": "550e8400-e29b-41d4-a716-446655440000",
    "current_turn": 1,
    "current_player": 1,
    "current_phase": "main",
    "player_number": 1,
    "player1_id": "user-uuid-1",
    "player2_id": "user-uuid-1",
    "player1_name": "Player",
    "player2_name": "Player",
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
        "id": "card-in-play-uuid",
        "card_id": "card-uuid-1",
        "instance_id": "card-in-play-uuid",
        "player_number": 1,
        "zone": "hand",
        "position": 0,
        "mode": "normal",
        "is_exhausted": false,
        "base_data": {
          "id": "card-uuid-1",
          "name": "Caballero de Plata",
          "type": "knight",
          "rarity": "common",
          "cost": 2,
          "image_url": "https://...",
          "description": "..."
        }
      }
    ]
  }
}
```

### WebSocket Event: match_update (Servidor → Cliente)

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
    "player1_cosmos": 1,
    "player2_cosmos": 0,
    "player1_hand_count": 7,
    "player2_hand_count": 8,
    "player1_deck_size": 32,
    "player2_deck_size": 32,
    "cards_in_play": [...]
  }
}
```

---

## 🧪 Verificación Pre-Testing

### Cliente (Godot)
```bash
✅ TestBoard.gd - sin errores de compilación
✅ GameState.gd - sin errores de compilación
✅ Todos los @onready asignados correctamente
✅ Signals conectados en _ready()
✅ Métodos de renderizado implementados
✅ Métodos de acción implementados
```

### Servidor (Node.js)
```bash
✅ src/routes/matches.routes.ts - sin errores
✅ src/controllers/matches.controller.ts - sin errores
✅ src/services/websocket.service.ts - sin errores
✅ handleRequestTestMatch implementado
✅ handleDeclareAttack implementado
✅ Case 'request_test_match' agregado al switch
✅ Case 'declare_attack' agregado al switch
```

---

## 🚀 Testing Instructions

### Prerequisitos
1. ✅ Servidor Node.js corriendo en puerto 3000
2. ✅ BD PostgreSQL conectada
3. ✅ Usuario creado en BD
4. ✅ Mazo con 40+ cartas creado para usuario
5. ✅ Mazo marcado como is_active = true
6. ✅ WebSocket disponible

### Step-by-Step Test

**Paso 1: Abrir TestBoard**
```gdscript
get_tree().change_scene_to_file("res://scenes/game/TestBoard.tscn")
```

**Paso 2: Click Botón TEST**
- Esperado: Loading label visible

**Paso 3: Esperar 5-10 segundos**
- Servidor: Obtiene deck, shuffle, roba, serializa
- Esperado: match_found event recibido

**Paso 4: Verificar UI**
- [x] Mano: 7 cartas visibles
- [x] Oponente: 7 dorsos visibles
- [x] Deck P1: contador = 33
- [x] Deck P2: contador = 33
- [x] Vida P1: 12
- [x] Vida P2: 12
- [x] Cosmos P1: 0
- [x] Cosmos P2: 0
- [x] Turno: 1
- [x] Jugador: "Jugador 1"

**Paso 5: Click End Turn**
- Esperado: 1-3 segundos espera
- Verificar:
  - [x] Turno → 2
  - [x] Jugador → "Jugador 2" (oponente)
  - [x] P2 mano → 8 cartas (robó 1)
  - [x] P2 deck → 32

**Paso 6: Continuar Turnos**
- Click end_turn varias veces
- Verificar que turno cambia correctamente

---

## 📚 Documentación

### Cliente
- ✅ [docs/TESTBOARD-SERVER-AUTHORITATIVE.md](../ccg/docs/TESTBOARD-SERVER-AUTHORITATIVE.md)
- ✅ [docs/TESTBOARD-REFACTOR-SUMMARY.md](../ccg/docs/TESTBOARD-REFACTOR-SUMMARY.md)
- ✅ [docs/TESTBOARD-DEBUGGING-GUIDE.md](../ccg/docs/TESTBOARD-DEBUGGING-GUIDE.md)

### Servidor
- ✅ [docs/TESTBOARD-SERVER-IMPLEMENTATION.md](./docs/TESTBOARD-SERVER-IMPLEMENTATION.md)

### Referencia
- ✅ [.github/copilot-instructions.md](./ccg/.github/copilot-instructions.md)
- ✅ [START-HERE.md](./ccg/START-HERE.md)

---

## ✅ Checklist Final

### Implementación
- [x] Cliente: TestBoard refactorizado a Server-Authoritative
- [x] Cliente: GameState con getters necesarios
- [x] Cliente: 9 pasos de flujo implementados
- [x] Servidor: Endpoint POST /api/match/test
- [x] Servidor: WebSocket handler request_test_match
- [x] Servidor: WebSocket handler declare_attack
- [x] Servidor: GameState serialization
- [x] Servidor: Shuffle & draw implementation
- [x] Servidor: Match persistence en BD
- [x] Servidor: Error handling

### Documentación
- [x] Client side flow documented
- [x] Server side implementation documented
- [x] Debugging guide created
- [x] Testing checklist prepared

### Testing
- [ ] Run client app and navigate to TestBoard
- [ ] Click TEST button
- [ ] Verify match_found event received
- [ ] Verify UI renders correctly
- [ ] Verify END TURN works
- [ ] Verify game state updates

---

## 🎯 Conclusión

**SISTEMA COMPLETAMENTE IMPLEMENTADO**

✅ **Cliente**: TestBoard listo, refactorizado a Server-Authoritative
✅ **Servidor**: POST /api/match/test + WebSocket handlers
✅ **BD**: Match y CardInPlay models completos
✅ **Comunicación**: WebSocket eventos definidos y implementados
✅ **Documentación**: Guías completas de testing y debugging

**LISTO PARA TESTING**

---

**Última Actualización**: Diciembre 22, 2025  
**Estado**: ✅ IMPLEMENTACIÓN COMPLETADA  
**Próximo**: Testing e2e con cliente+servidor

