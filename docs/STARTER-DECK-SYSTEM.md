# 🎴 Sistema de Deck Inicial

## Resumen

Los nuevos usuarios reciben un **deck inicial de 40 cartas competitivo** listo para jugar.

## 🚀 Configuración Rápida

### 1. Listar Cartas Disponibles

```bash
npx ts-node src/scripts/listCardsForStarterDeck.ts
```

Este script muestra:
- Todas las cartas comunes y raras disponibles
- IDs organizados por tipo
- Sugerencia automática de deck balanceado

### 2. Configurar el Deck

Edita `src/config/starter-deck.config.ts`:

```typescript
export const STARTER_DECK_CARDS: StarterDeckCard[] = [
  // CABALLEROS COMUNES (12 cartas)
  { card_id: 'uuid-de-carta', quantity: 3 }, // 3 copias
  
  // CABALLEROS RAROS (8 cartas)  
  { card_id: 'uuid-de-carta', quantity: 2 }, // 2 copias
  
  // TÉCNICAS RARAS (10 cartas)
  { card_id: 'uuid-de-carta', quantity: 2 },
  
  // OBJETOS (6 cartas)
  { card_id: 'uuid-de-carta', quantity: 2 },
  
  // AYUDANTES (2 cartas)
  { card_id: 'uuid-de-carta', quantity: 2 },
  
  // OCASIONES (2 cartas)
  { card_id: 'uuid-de-carta', quantity: 2 },
];
// Total: 40 cartas
```

### 3. Distribución Recomendada

| Tipo | Cantidad | Propósito |
|------|----------|-----------|
| Caballeros | 18-22 | Core del deck |
| Técnicas | 8-12 | Remoción/buffs |
| Objetos | 4-6 | Equipamiento |
| Ayudantes | 2-4 | Draw/search |
| Ocasiones | 2-4 | Eventos clave |

**Curva de costos:**
- Costo 1-2: ~20 cartas (early game)
- Costo 3: ~12 cartas (mid game)
- Costo 4+: ~8 cartas (finishers)

## 📝 Implementación

### Archivos Modificados

```
src/
├── config/starter-deck.config.ts        [NUEVO] Configuración del deck
├── controllers/auth.controller.ts       [MODIFICADO] Usa deck inicial
├── models/UserCardTransaction.ts        [MODIFICADO] Agregado STARTER_DECK
└── scripts/
    ├── assignStarterCards.ts           [MODIFICADO] Asigna 40 cartas + deck
    └── listCardsForStarterDeck.ts      [NUEVO] Helper para configurar
```

### Flujo de Registro

```
1. Usuario se registra
2. assignStarterCards(user_id) se ejecuta
   ├── Valida configuración (40 cartas)
   ├── Crea UserCard entries (40 cartas)
   ├── Crea Deck activo
   ├── Crea DeckCard entries
   └── Log de transacciones
3. Usuario puede jugar inmediatamente
```

## ✅ Validaciones

El sistema valida automáticamente:
- ✅ Total exacto de 40 cartas
- ✅ Cantidad por carta: 1-3 copias
- ✅ IDs válidos en base de datos

## 🔧 Mantenimiento

**Para actualizar el deck:**

1. Ejecuta el script helper
2. Copia los IDs que necesites
3. Edita `starter-deck.config.ts`
4. Reinicia el servidor

Los cambios aplican solo a **nuevos usuarios**.

## 📊 Experiencia del Usuario

**Antes:** 6 cartas aleatorias → No puede jugar → Debe comprar packs

**Ahora:** 40 cartas balanceadas → Deck activo → Puede jugar inmediatamente ✅
