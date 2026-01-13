# Caballeros Cósmicos - API Reference

Comprehensive API documentation for the Saint Seiya card game backend.

## Base URL
```
http://localhost:3000/api
```

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Cards Endpoints

### GET /cards

Retrieve cards with advanced filtering and translation support.

**Authentication:** Not required

**Query Parameters:**
- `type` (string): Filter by card type (`caballero`, `tecnica`, `objeto`, `escenario`, `ayudante`, `ocasion`)
- `rarity` (string): Filter by rarity (`comun`, `rara`, `epica`, `legendaria`)
- `element` (string): Filter by element (e.g., `fuego`, `agua`, `tierra`, `aire`)
- `faction` (string): Filter by faction (e.g., `Athena`, `Poseidon`, `Hades`)
- `cost_min` (number): Minimum cost
- `cost_max` (number): Maximum cost
- `power_level_min` (number): Minimum power level (1-10)
- `power_level_max` (number): Maximum power level (1-10)
- `tags` (string): Comma-separated tags (e.g., `ofensiva,defensa`)
- `search` (string): Search in name and description
- `lang` (string): Language for translations (`es`, `en`, `pt`). Default: `es`
- `include_stats` (boolean): Include CardKnight stats. Default: `true`
- `include_abilities` (boolean): Include CardAbility data. Default: `true`
- `limit` (number): Results per page. Default: 50
- `offset` (number): Pagination offset. Default: 0

**Response:**
```json
{
  "total": 128,
  "cards": [
    {
      "id": "uuid",
      "name": "Seiya de Pegaso",
      "description": "El caballero de bronce de Pegaso",
      "type": "caballero",
      "rarity": "legendaria",
      "cost": 5,
      "faction": "Athena",
      "element": "fuego",
      "image_url": "https://...",
      "generate": 2,
      "max_copies": 1,
      "unique": true,
      "playable_zones": ["batalla", "soporte"],
      "power_level": 9,
      "tags": ["ofensiva", "protagonista"],
      "card_set": "Bronze Saints",
      "release_year": 2024,
      "card_knight": {
        "attack": 8,
        "defense": 6,
        "cosmo_power": 9
      },
      "abilities": [
        {
          "id": "uuid",
          "name": "Meteoros de Pegaso",
          "description": "Ataque devastador con 100 meteoros",
          "conditions": {"cosmos_min": 3},
          "effects": {"damage": 5, "ignore_defense": true}
        }
      ]
    }
  ]
}
```

**Examples:**

Get all legendary knights:
```
GET /cards?type=caballero&rarity=legendaria
```

Get fire element cards with high power:
```
GET /cards?element=fuego&power_level_min=7
```

Get cards with English translations:
```
GET /cards?lang=en&limit=20
```

Search for specific cards:
```
GET /cards?search=dragon&type=caballero
```

Get cards by tags:
```
GET /cards?tags=ofensiva,legendaria
```

---

### GET /cards/:id

Get a single card with full details and relations.

**Authentication:** Not required

**Query Parameters:**
- `lang` (string): Language for translation (`es`, `en`, `pt`)

**Response:**
```json
{
  "id": "uuid",
  "name": "Shiryu de Dragón",
  "description": "El caballero de bronce del Dragón",
  "type": "caballero",
  "rarity": "legendaria",
  "cost": 5,
  "faction": "Athena",
  "element": "tierra",
  "image_url": "https://...",
  "generate": 2,
  "max_copies": 1,
  "unique": true,
  "playable_zones": ["batalla"],
  "power_level": 9,
  "tags": ["defensiva", "protagonista"],
  "card_set": "Bronze Saints",
  "release_year": 2024,
  "artist": "Masami Kurumada",
  "balance_notes": "Máxima 1 copia por su poder único",
  "card_knight": {
    "id": "uuid",
    "card_id": "uuid",
    "attack": 7,
    "defense": 9,
    "cosmo_power": 8,
    "armor_level": "bronze",
    "constellation": "dragon"
  },
  "abilities": [
    {
      "id": "uuid",
      "card_id": "uuid",
      "name": "Cólera del Dragón",
      "description": "Ataque concentrado con todo el cosmos",
      "ability_type": "active",
      "cost": 3,
      "conditions": {"cosmos_min": 3},
      "effects": {"damage": 6, "piercing": true}
    }
  ]
}
```

**Example:**
```
GET /cards/a1b2c3d4-uuid?lang=en
```

---

### GET /cards/stats/summary

Get aggregated statistics about all cards.

**Authentication:** Not required

**Response:**
```json
{
  "total_cards": 128,
  "by_type": {
    "caballero": 45,
    "tecnica": 30,
    "objeto": 20,
    "escenario": 15,
    "ayudante": 10,
    "ocasion": 8
  },
  "by_rarity": {
    "comun": 60,
    "rara": 40,
    "epica": 20,
    "legendaria": 8
  },
  "by_element": {
    "fuego": 25,
    "agua": 20,
    "tierra": 22,
    "aire": 18,
    "luz": 12,
    "oscuridad": 10,
    "neutral": 21
  }
}
```

---

## Decks Endpoints

All deck endpoints require authentication.

### GET /decks

Get all decks for the authenticated user.

**Authentication:** Required

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "Deck de Bronces",
    "description": "Mazo con caballeros de bronce",
    "is_active": true,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-20T14:45:00Z"
  }
]
```

---

### GET /decks/:id

Get a specific deck with all its cards.

**Authentication:** Required

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Deck de Bronces",
  "description": "Mazo con caballeros de bronce",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T14:45:00Z",
  "cards": [
    {
      "id": "card-uuid",
      "name": "Seiya de Pegaso",
      "type": "caballero",
      "rarity": "legendaria",
      "cost": 5,
      "DeckCard": {
        "quantity": 1
      },
      "card_knight": {
        "attack": 8,
        "defense": 6
      }
    }
  ]
}
```

---

### POST /decks

Create a new deck.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Mi Nuevo Deck",
  "description": "Descripción del deck"
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Mi Nuevo Deck",
  "description": "Descripción del deck",
  "is_active": false,
  "created_at": "2024-01-20T15:00:00Z",
  "updated_at": "2024-01-20T15:00:00Z"
}
```

---

### PUT /decks/:id

Update deck information.

**Authentication:** Required

**Request Body:**
```json
{
  "name": "Nombre Actualizado",
  "description": "Nueva descripción",
  "is_active": true
}
```

**Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Nombre Actualizado",
  "description": "Nueva descripción",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-20T15:30:00Z"
}
```

---

### DELETE /decks/:id

Delete a deck.

**Authentication:** Required

**Response:**
```json
{
  "message": "Deck eliminado correctamente"
}
```

---

### POST /decks/:id/cards

Add a card to a deck.

**Authentication:** Required

**Request Body:**
```json
{
  "card_id": "card-uuid",
  "quantity": 2
}
```

**Validation:**
- Respects `card.max_copies` (default: 3)
- Unique cards (`unique: true`) limited to 1 copy
- Cannot exceed owned quantity

**Response:**
```json
{
  "message": "Carta agregada al deck correctamente"
}
```

**Error Response (max copies exceeded):**
```json
{
  "error": "Ya tienes el máximo de copias de Seiya de Pegaso (1 permitida)"
}
```

---

### PUT /decks/:id/cards/:card_id

Update card quantity in a deck.

**Authentication:** Required

**Request Body:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "message": "Cantidad actualizada correctamente"
}
```

---

### DELETE /decks/:id/cards/:card_id

Remove a card from a deck.

**Authentication:** Required

**Response:**
```json
{
  "message": "Carta eliminada del deck correctamente"
}
```

---

### PUT /decks/:id/sync-cards

Synchronize all cards in a deck (replaces existing cards).

**Authentication:** Required

**Request Body:**
```json
{
  "cards": [
    {
      "card_id": "card-uuid-1",
      "quantity": 2
    },
    {
      "card_id": "card-uuid-2",
      "quantity": 1
    }
  ]
}
```

**Response:**
Returns the complete updated deck with all cards:
```json
{
  "id": "uuid",
  "name": "Mi Deck",
  "cards": [
    {
      "id": "card-uuid-1",
      "name": "Seiya de Pegaso",
      "DeckCard": {
        "quantity": 2
      }
    }
  ]
}
```

---

### GET /decks/:id/validate

Validate a deck against game rules.

**Authentication:** Required

**Response:**
```json
{
  "valid": true,
  "errors": [],
  "warnings": [
    "Deck tiene muy pocas cartas de tipo 'caballero' (solo 5, recomendado: al menos 15)"
  ],
  "deck_name": "Mi Deck"
}
```

**Validation Rules:**
- Minimum 40 cards, maximum 50 cards
- Respects per-card `max_copies` limits
- Checks for `unique` cards (max 1 copy)
- At least 15 knight cards recommended (warning)
- No more than 10 legendary cards (warning)
- Average power level should be reasonable (warning)

**Example Invalid Response:**
```json
{
  "valid": false,
  "errors": [
    "Deck debe tener entre 40 y 50 cartas (actualmente: 35)",
    "Demasiadas copias de 'Seiya de Pegaso': 2 (máximo: 1)"
  ],
  "warnings": [
    "Deck tiene demasiadas cartas legendarias (12, recomendado: máximo 10)"
  ],
  "deck_name": "Mi Deck"
}
```

---

### GET /decks/:id/stats

Get detailed statistics for a deck.

**Authentication:** Required

**Response:**
```json
{
  "deck_name": "Mi Deck",
  "total_cards": 45,
  "unique_cards": 32,
  "avg_cost": 3.2,
  "avg_generate": 1.8,
  "avg_power_level": 5.4,
  "by_type": {
    "caballero": 20,
    "tecnica": 12,
    "objeto": 8,
    "escenario": 3,
    "ayudante": 2
  },
  "by_rarity": {
    "comun": 18,
    "rara": 15,
    "epica": 9,
    "legendaria": 3
  },
  "by_element": {
    "fuego": 12,
    "agua": 8,
    "tierra": 10,
    "aire": 7,
    "neutral": 8
  }
}
```

**Use Cases:**
- Display deck composition in UI
- Balance analysis
- Deck building recommendations
- Compare deck strategies

---

## Authentication Endpoints

### POST /auth/register

Register a new user.

**Authentication:** Not required

**Request Body:**
```json
{
  "username": "player123",
  "email": "player@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "message": "Usuario registrado exitosamente",
  "user": {
    "id": "uuid",
    "username": "player123",
    "email": "player@example.com"
  }
}
```

---

### POST /auth/login

Login and receive JWT token.

**Authentication:** Not required

**Request Body:**
```json
{
  "email": "player@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "uuid",
    "username": "player123",
    "email": "player@example.com",
    "gold": 1000,
    "crystals": 50
  }
}
```

---

## User Cards Endpoints

### GET /user-cards

Get all cards owned by the authenticated user.

**Authentication:** Required

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "card_id": "card-uuid",
    "quantity": 3,
    "card": {
      "id": "card-uuid",
      "name": "Seiya de Pegaso",
      "type": "caballero",
      "rarity": "legendaria",
      "image_url": "https://..."
    }
  }
]
```

---

## Error Responses

All endpoints return errors in Spanish with appropriate HTTP status codes:

**400 Bad Request:**
```json
{
  "error": "Datos de entrada inválidos"
}
```

**401 Unauthorized:**
```json
{
  "error": "Token no válido"
}
```

**404 Not Found:**
```json
{
  "error": "Deck no encontrado"
}
```

**500 Internal Server Error:**
```json
{
  "error": "Error interno del servidor"
}
```

---

## Rate Limiting

Currently no rate limiting is implemented. Consider implementing for production.

---

## Pagination

Endpoints that return lists support pagination:
- `limit`: Number of results per page (default: 50, max: 100)
- `offset`: Number of results to skip (default: 0)

Example:
```
GET /cards?limit=20&offset=40
```

---

## CORS

CORS is enabled for all origins in development. Configure appropriately for production.

---

## Future Endpoints (Planned)

- `POST /matches` - Create a new match
- `GET /matches/:id` - Get match state
- `PUT /matches/:id/action` - Execute game action
- `POST /packs/open` - Open card packs
- `GET /shop/packs` - List available packs for purchase
