# 🎁 Sistema de Sobres y Transacciones

## ✅ Sistema Completamente Implementado

### 📊 Probabilidades de Rareza

Las cartas se generan con las siguientes probabilidades:

| Rareza | Probabilidad | Cartas Disponibles |
|--------|--------------|-------------------|
| **Común** | 60% | 10 cartas |
| **Rara** | 25% | 26 cartas |
| **Épica** | 12% | 19 cartas |
| **Legendaria** | 3% | 21 cartas |

**Total: 76 cartas en el juego**

### 🎁 Packs Disponibles

| Pack | Precio | Cartas | Garantía |
|------|--------|--------|----------|
| **Sobre Básico** | 50 💰 | 3 cartas | ❌ Sin garantía |
| **Sobre de Bronce** | 100 💰 | 5 cartas | ✅ 1 Rara |
| **Sobre de Plata** | 200 💰 | 7 cartas | ✅ 1 Épica |
| **Sobre de Oro** | 400 💰 | 10 cartas | ✅ 1 Legendaria |
| **Mega Pack** | 750 💰 | 15 cartas | ✅ 1 Legendaria |

### 💎 Sistema de Cartas Foil

- **Probabilidad**: 5% en cada carta obtenida
- **Indicador**: Campo `is_foil` en `UserCard` y `UserCardTransaction`
- **Visual**: Las cartas foil aparecen con efecto brillante/dorado

## 📝 Sistema de Logging Completo

### 1️⃣ Transacciones de Monedas (`UserTransaction`)

**Tabla**: `user_transactions`

**Campos Registrados**:
```typescript
{
  user_id: string,           // UUID del usuario
  amount: number,            // Cantidad de monedas
  type: 'EARN' | 'SPEND',    // Ganancia o gasto
  reason: TransactionReason,  // Razón específica
  description: string,        // Descripción legible
  balance_before: number,     // Monedas antes
  balance_after: number,      // Monedas después
  related_entity_type: string, // 'pack', 'card', etc.
  related_entity_id: string,   // UUID del pack/carta
  metadata: object,           // Info adicional (JSON)
  created_at: timestamp
}
```

**Razones de Gasto (SPEND)**:
- `PACK_PURCHASE` - Compra de sobres
- `CARD_PURCHASE` - Compra directa de cartas
- `UPGRADE_COST` - Mejorar cartas
- `TOURNAMENT_FEE` - Inscripción a torneos
- `PREMIUM_FEATURE` - Funciones premium

**Razones de Ganancia (EARN)**:
- `REGISTRATION_BONUS` - Bono de registro (1000 monedas)
- `DAILY_LOGIN` - Login diario
- `MATCH_WIN` - Ganar partida
- `ACHIEVEMENT` - Logro desbloqueado
- `QUEST_REWARD` - Recompensa de misión
- `EVENT_REWARD` - Evento especial

**Ejemplo de Log**:
```javascript
{
  amount: 200,
  type: 'SPEND',
  reason: 'PACK_PURCHASE',
  description: 'Compra de 2x Sobre de Bronce',
  balance_before: 1000,
  balance_after: 800,
  related_entity_type: 'pack',
  related_entity_id: 'pack-uuid-123',
  metadata: {
    pack_name: 'Sobre de Bronce',
    quantity: 2
  }
}
```

### 2️⃣ Transacciones de Cartas (`UserCardTransaction`)

**Tabla**: `user_card_transactions`

**Campos Registrados**:
```typescript
{
  user_id: string,
  card_id: string,            // UUID de la carta
  quantity: number,           // Cantidad (1 por defecto)
  type: 'ACQUIRE' | 'LOSE',   // Obtención o pérdida
  reason: CardTransactionReason,
  description: string,
  is_foil: boolean,           // Si es carta foil
  related_entity_type: string, // 'pack', 'trade', etc.
  related_entity_id: string,
  metadata: object,           // Pack name, rarity, etc.
  created_at: timestamp
}
```

**Razones de Obtención (ACQUIRE)**:
- `PACK_OPENING` - Abrir sobre
- `DIRECT_PURCHASE` - Compra directa
- `TRADE_RECEIVED` - Recibida en intercambio
- `QUEST_REWARD` - Recompensa de misión
- `EVENT_REWARD` - Evento
- `ADMIN_GIFT` - Regalo del administrador
- `STARTER_PACK` - Pack inicial
- `ACHIEVEMENT_REWARD` - Logro

**Razones de Pérdida (LOSE)**:
- `TRADE_SENT` - Enviada en intercambio
- `CARD_SALE` - Venta de carta
- `UPGRADE_MATERIAL` - Usada para mejorar
- `ADMIN_REMOVAL` - Removida por admin
- `TOURNAMENT_ANTE` - Apuesta de torneo

**Ejemplo de Log**:
```javascript
{
  card_id: 'card-saga-uuid',
  quantity: 1,
  type: 'ACQUIRE',
  reason: 'PACK_OPENING',
  description: 'Carta obtenida al abrir Sobre de Oro',
  is_foil: false,
  related_entity_type: 'pack',
  related_entity_id: 'pack-oro-uuid',
  metadata: {
    pack_name: 'Sobre de Oro',
    card_name: 'Saga de Géminis',
    card_rarity: 'legendaria'
  }
}
```

## 🔌 Endpoints de Historial

### GET `/api/transactions/currency`
Obtiene historial de transacciones de monedas.

**Query params**:
- `limit` (default: 50) - Cantidad de resultados
- `offset` (default: 0) - Paginación

**Respuesta**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "amount": 100,
      "type": "SPEND",
      "reason": "PACK_PURCHASE",
      "description": "Compra de 1x Sobre de Bronce",
      "balance_before": 1000,
      "balance_after": 900,
      "created_at": "2025-11-11T10:30:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 15 }
}
```

### GET `/api/transactions/cards`
Obtiene historial de transacciones de cartas.

**Query params**: `limit`, `offset`

**Respuesta**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "card_id": "card-uuid",
      "quantity": 1,
      "type": "ACQUIRE",
      "reason": "PACK_OPENING",
      "is_foil": true,
      "card": {
        "name": "Seiya de Pegaso",
        "type": "caballero",
        "rarity": "rara"
      },
      "created_at": "2025-11-11T10:31:00Z"
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "total": 42 }
}
```

### GET `/api/transactions/stats`
Estadísticas generales del usuario.

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "currency": [
      { "type": "EARN", "total_amount": 2500, "transaction_count": 15 },
      { "type": "SPEND", "total_amount": 1500, "transaction_count": 8 }
    ],
    "cards": [
      { "type": "ACQUIRE", "total_cards": 87, "transaction_count": 87 },
      { "type": "LOSE", "total_cards": 3, "transaction_count": 2 }
    ]
  }
}
```

### GET `/api/transactions/recent`
Actividad de las últimas 24 horas.

**Respuesta**:
```json
{
  "success": true,
  "data": {
    "currency_transactions": [...],  // Últimas 10
    "card_transactions": [...]       // Últimas 10
  }
}
```

## 🎮 Flujo de Compra y Apertura

### Comprar Pack

**Endpoint**: `POST /api/packs/buy`

**Request**:
```json
{
  "pack_id": "uuid-del-pack",
  "quantity": 2
}
```

**Proceso**:
1. Verifica que el usuario tiene monedas suficientes
2. Descuenta `pack.price * quantity` de `user.currency`
3. **Registra en `UserTransaction`**: SPEND, PACK_PURCHASE
4. Agrega packs a `UserPack` (inventario)
5. Devuelve confirmación con balance actual

**Respuesta**:
```json
{
  "success": true,
  "message": "Compraste 2 Sobre de Bronce(s) por 200 monedas",
  "data": {
    "pack_name": "Sobre de Bronce",
    "quantity_bought": 2,
    "total_cost": 200,
    "remaining_currency": 800
  }
}
```

### Abrir Pack

**Endpoint**: `POST /api/packs/open`

**Request**:
```json
{
  "pack_id": "uuid-del-pack"
}
```

**Proceso**:
1. Verifica que el usuario tiene el pack en inventario
2. Genera N cartas según `pack.cards_per_pack`
3. Aplica probabilidades (60/25/12/3%)
4. Garantiza rareza mínima si `pack.guaranteed_rarity` existe
5. 5% chance de carta foil en cada una
6. Agrega cartas a `UserCard` (colección)
7. **Registra CADA carta en `UserCardTransaction`**: ACQUIRE, PACK_OPENING
8. Reduce cantidad de packs en inventario
9. Devuelve cartas obtenidas

**Respuesta**:
```json
{
  "success": true,
  "message": "¡Abriste un Sobre de Oro!",
  "data": {
    "pack_name": "Sobre de Oro",
    "cards": [
      {
        "id": "card-1",
        "name": "Seiya de Pegaso",
        "rarity": "rara",
        "is_foil": false
      },
      {
        "id": "card-2",
        "name": "Saga de Géminis",
        "rarity": "legendaria",
        "is_foil": true
      }
      // ... 8 cartas más
    ],
    "summary": {
      "total_cards": 10,
      "by_rarity": {
        "comun": 5,
        "rara": 3,
        "epica": 1,
        "legendaria": 1
      }
    }
  }
}
```

## 🔍 Consultar Logs en Base de Datos

### Ver transacciones de un usuario
```sql
-- Transacciones de monedas
SELECT * FROM user_transactions 
WHERE user_id = 'uuid-del-usuario' 
ORDER BY created_at DESC 
LIMIT 20;

-- Transacciones de cartas
SELECT uct.*, c.name, c.rarity 
FROM user_card_transactions uct
JOIN cards c ON c.id = uct.card_id
WHERE uct.user_id = 'uuid-del-usuario'
ORDER BY uct.created_at DESC
LIMIT 20;
```

### Estadísticas de un usuario
```sql
-- Total gastado en packs
SELECT SUM(amount) as total_gastado
FROM user_transactions
WHERE user_id = 'uuid' AND type = 'SPEND' AND reason = 'PACK_PURCHASE';

-- Cartas obtenidas de packs
SELECT COUNT(*) as cartas_de_packs
FROM user_card_transactions
WHERE user_id = 'uuid' AND reason = 'PACK_OPENING';

-- Cartas foil obtenidas
SELECT COUNT(*) as cartas_foil
FROM user_card_transactions
WHERE user_id = 'uuid' AND is_foil = true;
```

## 📈 Ventajas del Sistema de Logging

1. **Auditoría Completa**: Cada transacción queda registrada permanentemente
2. **Balance Histórico**: `balance_before` y `balance_after` permiten reconstruir historial
3. **Trazabilidad**: Metadata JSONB guarda contexto completo
4. **Detección de Fraude**: Fácil detectar anomalías o manipulación
5. **Estadísticas**: Análisis de comportamiento de usuarios
6. **Soporte**: Resolver disputas con evidencia clara
7. **Economía del Juego**: Ajustar precios/probabilidades basado en datos

## 🎯 Próximas Mejoras

- [ ] Dashboard de estadísticas en Godot
- [ ] Notificaciones de cartas raras obtenidas
- [ ] Sistema de intercambio con logs de trades
- [ ] Achievements basados en historial
- [ ] Gráficos de evolución de colección
- [ ] Export de historial a CSV/PDF

---

**Estado**: ✅ Sistema completo y funcional con logging exhaustivo
