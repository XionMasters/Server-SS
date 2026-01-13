# Sistema de Matchmaking Mejorado

## Problemas del Sistema Actual

1. **No hay cancelación**: Las partidas en `waiting` quedan huérfanas
2. **No verifica disponibilidad**: Puede emparejar usuarios que ya cancelaron
3. **Player2_id temporal confuso**: Se usa `player2_id = player1_id` temporalmente

## Solución Propuesta

### 1. Nuevo Modelo: MatchmakingQueue

Crear tabla separada para la cola de búsqueda:

```typescript
{
  user_id: UUID,
  deck_id: UUID,
  created_at: TIMESTAMP,
  expires_at: TIMESTAMP, // Auto-expira después de 5 minutos
  status: 'searching' | 'matched' | 'cancelled'
}
```

### 2. Flujo Mejorado

```
Usuario presiona "Buscar"
  ↓
Frontend: is_searching = true, muestra "Buscando..."
  ↓
Backend: Inserta en matchmaking_queue con status='searching'
  ↓
Backend: Busca otro usuario en queue con status='searching'
  ↓
SI NO HAY → Responde { status: 'searching', queue_id }
SI HAY    → Crea Match, marca ambas queues como 'matched'
  ↓
Frontend hace polling de queue_id cada 2s
  ↓
Usuario presiona "Cancelar"
  ↓
Backend: Marca queue como 'cancelled'
  ↓
Frontend: Deja de hacer polling
```

### 3. Endpoint de Cancelación

```typescript
POST /api/matches/cancel-search
Body: { queue_id }
```

### 4. Verificación de Disponibilidad

Antes de crear Match, verificar:
- Ambas entradas en queue tienen status='searching'
- No han expirado (< 5 minutos)
- Los usuarios siguen autenticados

### 5. Auto-limpieza

Cron job que elimina entries de queue con:
- status='cancelled'
- expires_at < NOW()
- Más de 10 minutos de antigüedad
