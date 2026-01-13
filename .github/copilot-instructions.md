# Copilot Instructions: Caballeros Cósmicos API

## Project Overview
This is a TypeScript Express.js API for a Saint Seiya-themed card game called "Caballeros Cósmicos" using PostgreSQL with Sequelize ORM.

## Architecture & Data Flow

### Core Structure
- **Entry Point**: `src/server.ts` → `src/app.ts` (Express setup)
- **Database**: PostgreSQL with Sequelize ORM, auto-sync in development
- **Authentication**: JWT tokens with bcrypt hashing
- **API Pattern**: Routes → Controllers → Models (no services layer currently)

### Card Game Domain Model
The game centers around Saint Seiya characters with specific card types:
- **Card Types**: `knight`, `technique`, `item`, `stage`, `helper`, `event` (English values used internally)
- **Rarities**: `common`, `rare`, `epic`, `legendary`, `divine` (English values used internally)
- **Factions**: Primarily `Athena` (extensible for other gods)
- **Elements**: `steel`, `fire`, `water`, `earth`, `wind`, `light`, `dark`

### Key Model Relationships
```
Card (base) → CardKnight (caballero stats) → CardAbility (JSONB effects)
User (with currency) → UserCards → Decks → DeckCards
User → Matches (matchmaking system)
```

## Game Mechanics

### Battle System

#### Knight Actions (Acciones de Caballeros)
Each knight can perform the following actions during their turn:

1. **Batalhar (BA)** - Basic Attack
   - Direct attack that doesn't require a technique card
   - Uses CE (Combat Energy) directly to attack
   - Damage calculation: `[CE_ATTACKER] - [AR_DEFENDER] = [DAMAGE]`
   - Minimum damage is always at least 1

2. **Técnica (TA)** - Technique Attack
   - Attack using a technique card's special power
   - Requires an appropriate technique card activated on the battlefield
   - Technique must be activated before using this command
   - Multiple knights can use the same technique if compatible

3. **Carregar Cosmo** - Charge Cosmos
   - Recovers 3 CP (Cosmos Points) for the player
   - **Warning**: Using this ability opens the knight to future opponent attacks

4. **Sacrificar Cavaleiro** - Sacrifice Knight
   - Eliminate one of your own knights
   - Cost: 1 DLP (Life Point penalty)
   - Useful when you need empty battlefield spaces

5. **Modo Evasão** - Evade Mode
   - Knight enters evasion stance to avoid incoming damage
   - BA (Basic Attacks) have 50% chance to miss
   - Uses coin flip mechanic: Heads = hit connects, Tails = attack misses
   - Negates all damage and "attached" effects if evade succeeds

6. **Movimentar Cavaleiro** - Move Knight
   - Move knight card to any empty space on your side of the battlefield

7. **Modo Defesa** - Block Mode
   - Knight enters defensive stance to reduce incoming damage
   - Resistant to both BA and TA attacks
   - Damage reduction: `[HALF_OF_ATTACKER_CE] - [DEFENDER_AR] = [DAMAGE]`

8. **Oração Divina** - Divine Prayer
   - Special ability (details TBD)

#### Combat Modes Comparison

| Mode | Effect | Calculation |
|------|--------|-------------|
| **Normal** | Standard combat | `CE_ATK - AR_DEF = DMG` |
| **Block (Defesa)** | Reduces damage by half attacker's CE | `(CE_ATK / 2) - AR_DEF = DMG` |
| **Evade (Evasão)** | 50% chance to completely avoid BA | Coin flip: Heads = hit, Tails = miss |

**Important Notes:**
- Evade mode only affects BA (Basic Attacks), not TA (Techniques) - verify this
- Block mode affects both BA and TA
- Techniques don't require knight on field to be revealed (can be revealed from hand)

### Starter Deck System
- New users receive a 40-card competitive starter deck
- Deck is pre-configured and marked as active
- Contains `common` and `rare` cards only (balanced for beginners)
- Configuration: `src/config/starter-deck.config.ts`
- All card types and rarities use English enum values internally

## Development Patterns

### Model Conventions
- Use UUIDs for primary keys (`DataTypes.UUIDV4`)
- Snake_case for database columns, timestamps enabled
- JSONB for complex data (`conditions`, `effects` in CardAbility)
- Enums for constrained values (card types, rarities) - **always use English values**:
  - Types: `knight`, `technique`, `item`, `stage`, `helper`, `event`
  - Rarities: `common`, `rare`, `epic`, `legendary`, `divine`

### Authentication Pattern
```typescript
// Controllers use this pattern:
const user = (req as any).user; // From authenticateToken middleware
// No services layer - direct model access in controllers
```

### Error Handling
- Spanish error messages throughout
- Explicit `return` after `res.status().json()` in controllers
- Consistent error format: `{ error: "mensaje" }`

### API Structure
- `/api/auth/*` - Public authentication endpoints  
- `/api/users/*` - Protected user endpoints (all routes use `authenticateToken`)
- `/api/cards/*` - Public card browsing (no auth required)

## Development Workflow

### Essential Commands
```bash
npm run dev          # Development with nodemon + ts-node
npm run build        # TypeScript compilation to dist/
npm start           # Production from dist/server.js
```

### Database Setup
- Environment variables: `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`
- Auto-sync in development mode (`sequelize.sync({ force: false })`)
- Seeding: `ts-node src/scripts/generatesAllCards.ts`

### Card Generation Script
Located in `src/scripts/generatesAllCards.ts` - comprehensive seeding with:
- Bronze/Silver/Gold knights with detailed abilities
- Game mechanics encoded in JSONB (`effects`, `conditions`)
- Cross-references between Card → CardKnight → CardAbility

## Key Implementation Details

### JSONB Effects System
CardAbility stores game mechanics as JSONB:
```typescript
conditions: { cosmos_min: 2 }
effects: { ignore_defense: true, damage: 3 }
```

### Security
- bcrypt with 12 salt rounds
- JWT with configurable expiration (`JWT_EXPIRES_IN`)
- Helmet, CORS, Morgan middleware stack
- User password excluded from queries (`attributes: { exclude: ['password_hash'] }`)

### Missing Infrastructure
- No testing framework setup
- No services layer (direct model access)
- Empty `/services` and `/utils` directories
- User card ownership/deck system not implemented

## Extending the Codebase

### Adding New Card Types
1. Update Card model enum for new type
2. Create specialized model if needed (like CardKnight)
3. Update generation script with new card data
4. Add type-specific business logic in controllers

### Adding New Endpoints
- Follow pattern: Route → Controller → Model
- Use `authenticateToken` middleware for protected routes
- Maintain Spanish error messages and consistent response format
- Always include explicit returns after error responses

### Game Mechanics Extension
Expand CardAbility JSONB structure for new effects/conditions while maintaining backward compatibility.