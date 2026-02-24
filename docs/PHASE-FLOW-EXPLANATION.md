# Flujo de Fases en Partida (Match Phase Flow)

**Documento explicativo sobre cómo el servidor maneja los estados/fases de una partida**

---

## El Problema que se Arregló

**Síntoma**: Las partidas no pasaban por la fase `'starting'` - saltaban directamente de `'waiting'` a `'player1_turn'` o `'player2_turn'`.

**Causa**: El servidor creaba la partida, la ponía en `'starting'`, cargaba todas las cartas, y luego **INMEDIATAMENTE** la cambiaba a `'player1_turn'`, sin darle tiempo al cliente a reaccionar.

**Solución**: Agregar un evento intermedio `'match_initializing'` que avisa al cliente que la partida se está preparando, para que haya una transición visual clara.

---

## Fases de Partida

```
┌─────────────────────────────────────────────────────────────────────┐
│                      CICLO DE VIDA DE UNA PARTIDA                  │
└─────────────────────────────────────────────────────────────────────┘

1️⃣ WAITING (Esperando rival)
   └─ Player 1 busca → Se crea Match con phase: 'waiting'
   └─ Match está en espera de que se una Player 2
   └─ Evento para cliente: 'searching'

2️⃣ STARTING (Inicializando juego)
   └─ Player 2 se une → Match cambia a phase: 'starting'
   └─ Se cargan todas las cartas
   └─ Evento para cliente: 'match_initializing' (NUEVO)
   └─ Tiempo: 1-2 segundos (mientras se cargan datos)

3️⃣ PLAYER1_TURN o PLAYER2_TURN (En juego)
   └─ Phase se decide randomicamente (quién empieza primero)
   └─ Se envía 'match_found' con todas las cartas
   └─ El turno actual ya está listo para jugarse
   └─ Evento para cliente: 'match_found'

4️⃣ FINISHED (Partida terminada)
   └─ Alguien ganó (vida = 0 o victoria por otra regla)
   └─ Phase: 'finished'
   └─ Evento para cliente: 'match_ended'
```

---

## Flujo Detallado: Matchmaking

### Paso 0: Player 1 Busca Rival

```typescript
// websocket.service.ts - handleSearchMatch()

// ❌ ANTES: Se creaba inmediatamente en 'waiting'
const newMatch = await Match.create({
  player1_id: userId,
  phase: 'waiting',  // ← Correcto
  player1_life: 12,
  player1_cosmos: 0,
  current_turn: 1,
  current_player: 1  // ← Default para esperar
});

// 📤 Enviar a cliente:
sendEvent(ws, 'searching', {
  message: 'Buscando rival...',
  match_id: newMatch.id
});
```

**En la BD ahora**:
```
Match {
  id: 'uuid-123',
  player1_id: 'user-abc',
  player2_id: null,        ← Esperando
  phase: 'waiting',        ← Estado: esperando rival
  current_player: 1,       ← Quién fue el primero
  current_turn: 1
}
```

**En el cliente Godot**:
```gdscript
# MatchManager recibe 'searching'
func _on_server_event(event_name, data):
    if event_name == "searching":
        print("⏳ Buscando rival...")
        # Mostrar: "Buscando rival..." con spinner
        # Deshabilitar botones
```

---

### Paso 1: Player 2 se Une

```typescript
// websocket.service.ts - handleSearchMatch()

// Buscar una partida en espera
const waitingMatch = await Match.findOne({
  where: { phase: 'waiting', ... }
});

if (waitingMatch) {
  // ✅ ENCONTRADA - Unir Player 2
  
  // PASO A: Cambiar a 'starting'
  waitingMatch.player2_id = userId;
  waitingMatch.player2_deck_id = activeDeck.id;
  waitingMatch.phase = 'starting';  // ← NUEVA FASE
  await waitingMatch.save();
  
  // PASO B: Enviar evento 'match_initializing' (⭐ NUEVO)
  const initializingData = {
    match_id: waitingMatch.id,
    phase: 'starting',
    message: 'Inicializando juego...'
  };
  
  sendEvent(ws, 'match_initializing', initializingData);            // P2
  sendEvent(player1Socket, 'match_initializing', initializingData); // P1
  
  // PASO C: Cargar todas las cartas (esto toma tiempo)
  await initializeMatchCards(waitingMatch, ...);
  // ... 0.5-1 segundo de procesamiento ...
  
  // PASO D: Randomizar quién empieza
  const firstPlayer = Math.random() < 0.5 ? 1 : 2;
  waitingMatch.current_player = firstPlayer;
  
  // PASO E: Cambiar a fase del primer jugador
  waitingMatch.phase = firstPlayer === 1 ? 'player1_turn' : 'player2_turn';
  awardBluePoint(waitingMatch, firstPlayer);
  await waitingMatch.save();
  
  // PASO F: Enviar estado COMPLETO (match_found)
  const matchData = {
    match_id: waitingMatch.id,
    phase: waitingMatch.phase,        // 'player1_turn' o 'player2_turn'
    current_player: waitingMatch.current_player,
    cards_in_play: [...],
    // ... todo el estado ...
  };
  
  sendEvent(ws, 'match_found', matchData);            // P2
  sendEvent(player1Socket, 'match_found', matchData); // P1
}
```

**Timeline en BD**:
```
t=0ms:   Match { phase: 'waiting', player2_id: null }
         → Player 2 se une

t=100ms: Match { phase: 'starting', player2_id: 'user-xyz' }
         → Evento 'match_initializing' enviado

t=500ms: Match { phase: 'player1_turn', current_player: 1 }
         → Evento 'match_found' enviado

         (o 'player2_turn' si se randomizó así)
```

---

## Cliente Godot: Recibiendo Eventos

### En MatchManager

```gdscript
# MatchManager.gd

signal turn_changed(new_player: int)
signal match_initializing()
signal match_found()

func _on_server_event(event_name: String, data: Dictionary):
    match event_name:
        
        "searching":
            print("⏳ Buscando rival...")
            emit_signal("match_initializing")
        
        "match_initializing":
            # ⭐ NUEVO: Mostrar pantalla de carga
            print("🎮 Inicializando juego...")
            _current_match_initializing = true
            emit_signal("match_initializing")
        
        "match_found":
            # Aquí ya está todo listo: cartas cargadas, turnos decididos
            print("✅ Partida encontrada")
            _sync_game_state(data)
            _current_match_initializing = false
            emit_signal("match_found")
            emit_signal("turn_changed", data.current_player)
```

### En GameBoard

```gdscript
# GameBoard.gd

func _on_match_initializing():
    """Mostrar pantalla de carga mientras se prepara el juego"""
    print("🎮 Preparando juego...")
    
    # Mostrar efecto visual
    _show_loading_screen("Inicializando partida...")
    
    # Reproducir sonido
    AudioManager.play("sfx_game_starting")
    
    # Desactivar botones
    end_turn_button.disabled = true

func _on_match_found(data: Dictionary):
    """El juego ya está listo, empezar"""
    print("✅ Juego listo")
    
    _hide_loading_screen()
    _render_game_board(data)
    
    if data.current_player == player_number:
        _on_our_turn_starts()
    else:
        _on_opponent_turn_starts()
```

---

## Estados Posibles en BD

| Phase | Significado | Player 1 | Player 2 | Cartas | Turno |
|-------|------------|----------|----------|--------|-------|
| `waiting` | Esperando rival | ✅ | ❌ | ❌ | 1 |
| `starting` | Inicializando | ✅ | ✅ | ⏳ | 1 |
| `player1_turn` | P1 jugando | ✅ | ✅ | ✅ | 1 |
| `player2_turn` | P2 jugando | ✅ | ✅ | ✅ | 2 |
| `finished` | Partida terminada | ✅ | ✅ | ✅ | - |

---

## Modelo Match.ts - Validación

El modelo define:

```typescript
phase: {
  type: DataTypes.ENUM('waiting', 'starting', 'player1_turn', 'player2_turn', 'finished'),
  defaultValue: 'waiting',  // ← Cuando se crea Match sin especificar phase
  allowNull: false
}
```

**Esto es correcto porque:**
- Una partida nueva siempre comienza esperando rival → `'waiting'`
- Cuando se une Player 2 → se cambia a `'starting'`
- Cuando se cargan cartas → se cambia a `'player1_turn'` o `'player2_turn'`

---

## Cambios Efectuados en websocket.service.ts

### ANTES (❌ Problema)

```typescript
waitingMatch.phase = 'starting';
await waitingMatch.save();

// ❌ Cargar cartas
await initializeMatchCards(...);

// ❌ INMEDIATAMENTE cambiar a player1_turn
waitingMatch.phase = 'player1_turn';
awardBluePoint(waitingMatch, 1);
await waitingMatch.save();

// ❌ Enviar al cliente con phase: 'player1_turn'
sendEvent(ws, 'match_found', matchData);
```

**Problema**: El cliente NUNCA ve `'starting'` - salta directamente a `'player1_turn'`

---

### DESPUÉS (✅ Solución)

```typescript
// 1️⃣ Cambiar a 'starting' y guardar
waitingMatch.phase = 'starting';
await waitingMatch.save();

// 2️⃣ Enviar evento 'match_initializing' (fase de carga)
sendEvent(ws, 'match_initializing', { phase: 'starting' });
sendEvent(player1Socket, 'match_initializing', { phase: 'starting' });

// 3️⃣ Cargar cartas (esto toma tiempo)
await initializeMatchCards(...);

// 4️⃣ Randomizar quién empieza
const firstPlayer = Math.random() < 0.5 ? 1 : 2;
waitingMatch.current_player = firstPlayer;

// 5️⃣ Cambiar a fase real (player1_turn o player2_turn)
waitingMatch.phase = firstPlayer === 1 ? 'player1_turn' : 'player2_turn';
awardBluePoint(waitingMatch, firstPlayer);
await waitingMatch.save();

// 6️⃣ Enviar al cliente con fase REAL
sendEvent(ws, 'match_found', {
  phase: waitingMatch.phase,  // 'player1_turn' o 'player2_turn' ahora
  // ...
});
sendEvent(player1Socket, 'match_found', matchData);
```

**Ventajas**:
- ✅ Cliente ve evento `'match_initializing'` durante la carga
- ✅ Cliente puede mostrar pantalla de carga
- ✅ Cuando llega `'match_found'`, todo está listo
- ✅ Transición visual clara

---

## Checklist de Implementación en Cliente

### GameBoard debe manejar:
- [ ] `'searching'` - Mostrar "Buscando rival..." con spinner
- [ ] `'match_initializing'` - Mostrar "Inicializando juego..." (NEW)
- [ ] `'match_found'` - Cargar tablero y empezar juego
- [ ] `'match_ended'` - Mostrar pantalla de resultado

### MatchManager debe propagar:
- [ ] Signal: `match_initializing` (NEW)
- [ ] Signal: `match_found`
- [ ] Signal: `turn_changed`

---

## Logs Esperados (Desde Servidor)

### Player 1 Busca

```
📝 No hay partidas en espera. Creando nueva partida para Player1...
⏳ Player1 esperando rival... (Match ID: uuid-123)
📤 Evento 'searching' enviado a Player1
```

### Player 2 se Une

```
🔍 Buscando partidas disponibles...
   - Partidas en waiting encontradas: 1
🎮 ¡MATCH ENCONTRADO!
   - Player 1: Player1 (uuid-abc) ✅ CONECTADO
   - Player 2: Player2 (uuid-xyz) ✅ CONECTADO
   - Match ID: uuid-123
   
✅ Partida actualizada a fase 'starting': uuid-123

📤 Enviando 'match_initializing' a ambos jugadores...

🎴 Inicializando cartas para ambos jugadores...

✅ Partida iniciada en fase: player1_turn

📤 Enviando 'match_found' con fase: player1_turn
```

---

## Logs Esperados (Desde Cliente Godot)

```
⏳ Buscando rival...
  (spinner animándose)

🎮 Inicializando juego...
  (pantalla de carga transparente)

✅ Juego listo
  ¡Es tu turno!
  (o "Turno del oponente" si Player 2 empieza)
```

---

## Testing

### Test 1: Creación de Match individual
```
1. Player 1 busca → Match en 'waiting'
2. Verificar: phase = 'waiting', player2_id = null
✅
```

### Test 2: Uniéndose Player 2
```
1. Player 2 se une a match en 'waiting'
2. Verificar: Phase cambia a 'starting' → 'player1_turn'
3. Verificar: Ambos jugadores reciben 'match_initializing'
4. Verificar: Ambos jugadores reciben 'match_found'
5. Verificar: Cartas están cargadas
✅
```

### Test 3: Aleatorización de turnos
```
Ejecutar Test 2 múltiples veces
Verificar que a veces empieza Player 1, a veces Player 2
✅
```

---

## Resumen

| Aspecto | Antes | Después |
|---------|-------|---------|
| Fases visibles | waiting → player1_turn | waiting → starting → player1_turn |
| Eventos cliente | 2 | 3 (added 'match_initializing') |
| Transición visual | Abrupta | Gradual con carga |
| Experiencia UX | ❌ Confusa | ✅ Clara |

**El cliente ahora puede ver claramente el progreso: Buscando → Inicializando → Jugando** 🎮

