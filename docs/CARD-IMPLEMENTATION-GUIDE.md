# Guía de Implementación de Cartas — Caballeros Cósmicos

Esta guía documenta paso a paso cómo agregar una nueva carta al juego, desde la BD hasta que sea completamente funcional en partida. Usa **Jabu de Unicornio** como ejemplo de referencia.

---

## Tabla de contenido
0. [Diccionario de términos](#0-diccionario-de-términos)
1. [Anatomía de una carta](#1-anatomía-de-una-carta)
2. [Sistema declarativo de habilidades (AbilityDefinition)](#2-sistema-declarativo-de-habilidades-abilitydefinition)
3. [Sistema de efectos de estado (StatusEffects)](#3-sistema-de-efectos-de-estado-statuseffects)
4. [Paso a paso: agregar una carta al seed](#4-paso-a-paso-agregar-una-carta-al-seed)
5. [Paso a paso: implementar una habilidad nueva](#5-paso-a-paso-implementar-una-habilidad-nueva)
6. [Archivos involucrados (mapa rápido)](#6-archivos-involucrados-mapa-rápido)
7. [Checklist de implementación](#7-checklist-de-implementación)

---

## 0. Diccionario de términos

| Abreviatura | Nombre completo | Descripción |
|---|---|---|
| AR | Armor Rating | Número defensivo del caballero |
| CE | Combat Effectiveness | Ataque del caballero |
| HP | Hit Points | Vida de la carta (también LP - Life Points en cartas antiguas) |
| CP | Cosmos Points | Capacidad de cosmo de la carta; se usa para habilidades y técnicas |
| BA | Basic Attack | Ataque básico sin usar técnica |
| TA | Technique Attack | Ataque usando una carta Técnica activada en campo |
| DIP | Direct Impact Points | Puntos de daño directo al jugador (1 DIP = restar 1 a la vida del jugador) |
| DIP directo | — | Cuando se ataca al jugador sin caballero que defienda |


## 1. Anatomía de una carta

### Valores de cosmos — formato `COST/GENERATE`

Cada carta tiene dos valores de cosmos separados:

| Campo BD | Qué significa | Ejemplo (Jabu) |
|---|---|---|
| `cost` | Cosmos que el jugador **necesita tener** para poder jugarla | `2` |
| `generate` | Cosmos que se **devuelve** al jugador al jugarla | `2` |

**Costo neto = `cost - generate`**. Jabu cuesta 2 y genera 2, por lo que su costo neto es **0**, pero igual se necesitan 2 cosmos disponibles al momento de jugarla.

> La validación comprueba `cosmos_disponible >= cost`. Luego se aplica `cosmos = cosmos - cost + generate`.

### Campos de `cards`

```sql
name        -- Nombre de la carta (100 chars máx)
type        -- 'knight' | 'technique' | 'item' | 'stage' | 'helper' | 'event'
rarity      -- 'common' | 'rare' | 'epic' | 'legendary' | 'divine' --Esto es segun el emblema del Bastón de Niké - Gris oscuro common, gris claro (referencia a plata) es rare - asi sucesivamente
cost        -- Cosmos requerido para jugarla
generate    -- Cosmos devuelto al jugarla (default 0)
description -- Texto de sabor
image_url   -- Ruta relativa desde /assets/cards/ (ej: 'bronzes/jabu.png')
faction     -- 'Athena' | 'Poseidon' | 'Hades' | etc.
element     -- 'steel' | 'fire' | 'water' | 'earth' | 'wind' | 'light' | 'dark'
max_copies  -- Máx copias en mazo (si rarity 'common' or 'rare' 3 | en otro casi solo 1)
unique      -- Si solo puede haber una instancia en campo, siempre 'true' | salvo que diga lo contrario
playable_zones -- Segun el type de la carta, opciones de card_in_play_zone_enum (Ej: 'knight' -> 'field_knight')
artist      -- Leerlo de la carta
language    -- idioma de la carta
```

### Campos de `card_knights` (solo para type = 'knight')

| Campo | Descripción juego | Nombre en carta |
|---|---|---|
| `attack` | CE — Combat Effectiveness | Número izquierdo del combate |
| `defense` | AR — Armor Rating | Número derecho del combate |
| `health` | HP — Hit Points | Vida de la carta |
| `cosmos` | CP — Cosmos Points | Capacidad de cosmo de la carta |
| `can_defend` | Si puede usar Modo Defensa | true/false |
| `defense_reduction` | Factor de reducción en modo defensa (0.5 = mitad) | 0.5 |
| `rank` | Rango del caballero | Véase tabla de rangos |

#### Rangos válidos (`rank`)

| Valor BD | Descripción |
|---|---|
| `Bronze Saint` | Caballeros de Bronce (Seiya, Shiryu, Jabu...) |
| `Steel Saint` | Caballeros de Acero |
| `Silver Saint` | Caballeros de Plata (Misty, Moses, Algol...) |
| `Gold Saint` | Caballeros de Oro (Mu, Saga, Aiolia...) |
| `Sonata Saint` | Caballeros Sonata |
| `Sapuris Saint` | Caballeros Sapuris |
| `Black Saint` | Caballeros Negros |

> El rango es relevante para efectos de cartas como "El Santuario" que afectan
> solo a caballeros de un rango específico.

---

## 1b. Zonas de juego por tipo de carta

Cada `type` de carta tiene una zona de destino fija una vez jugada:

| Tipo (`type`) | Zona en BD | Slots | Por jugador / Compartido | Permanencia |
|---|---|---|---|---|
| `knight` | `field_knight` | 0–4 (máx 5) | Por jugador | Permanente hasta morir |
| `technique` | `field_support` (cliente: `field_technique`) | 0–4 (máx 5) | Por jugador | Permanente |
| `item` | `field_support` (mismo que técnicas) | 0–4 (máx 5) | Por jugador | Permanente, asociado al caballero en el mismo slot |
| `helper` | `field_helper` | 0 (máx 1) | Por jugador | Permanente |
| `stage` | `field_scenario` | 0 (máx 1) | **Compartido** (ambos jugadores) | Permanente, sustituible |
| `event` / `occasion` | `field_occasion` | 0 (máx 1) | Por jugador | Se descarta al resolverse |

### Regla de items (objetos/equipamiento)

- Un objeto juega en el **mismo slot** que una técnica (comparten la fila de `field_support`).
- Está **asociado al caballero en la misma posición** dentro de `field_knight`.
- Si el caballero muere, el objeto pasa al **yomotsu** del jugador.
  _(TODO: implementar en `KnightManager.resolveKnightDeath()`)_

### Regla de escenarios (stage)

- Solo puede haber **1 escenario activo** en toda la partida (zona compartida).
- Sus efectos afectan a **ambos jugadores** si cumplen las condiciones del aura.
- Los efectos se calculan **dinámicamente en combate** por `FieldEffectsEngine`,
  no se persisten como `StatusEffects` en los caballeros.
  _(TODO Phase 2: integrar FieldEffectsEngine en AttackRulesEngine)_

---

### `effects` — formato `AbilityDefinition` (JSONB)

El campo `effects` en `card_abilities` ya **no** usa claves planas (`ba_direct_damage: 1`). Ahora es un objeto `AbilityDefinition` completo. Ver **Sección 2** para el esquema completo.

**Ejemplo: pasiva de Jabu (unicorn_horn)**
```json
{
  "trigger": "CARD_PLAYED",
  "actions": [
    { "type": "apply_status", "status": "unicorn_horn", "target": "self" }
  ]
}
```

**Ejemplo: activa Match 1 (ignore_armor)**
```json
{
  "trigger": "ACTIVE",
  "cost": [{ "type": "cosmos", "amount": 3 }],
  "conditions": [
    { "type": "cosmos_min", "amount": 3 },
    { "type": "has_status", "status": "unicorn_horn" }
  ],
  "actions": [
    { "type": "apply_status", "status": "ignore_armor", "target": "self" }
  ]
}
```

**Ejemplo: activa con coin flip (Phoenix Flames)**
```json
{
  "trigger": "ACTIVE",
  "cost": [{ "type": "cosmos", "amount": 3 }],
  "conditions": [
    { "type": "cosmos_min", "amount": 3 },
    { "type": "has_status", "status": "phoenix_rebirth" }
  ],
  "actions": [{
    "type": "coin_flip_then",
    "on_heads": [{ "type": "apply_status", "status": "burn", "target": "target", "value": 1, "duration": 3 }],
    "on_fail":  []
  }]
}
```

**Ejemplo: activa con costo de descarte (Justice Fist)**
```json
{
  "trigger": "ACTIVE",
  "cost": [{ "type": "discard", "target": "self_hand" }],
  "conditions": [
    { "type": "has_status", "status": "last_stand" },
    { "type": "hand_not_empty" }
  ],
  "actions": [
    { "type": "apply_status", "status": "ignore_armor", "target": "self" }
  ]
}
```

---

## 2. Sistema declarativo de habilidades (AbilityDefinition)

El motor de habilidades es **100% declarativo**: cada habilidad está completamente descrita en el JSONB `effects` de `card_abilities`. No se requiere código TypeScript para agregar cartas con efectos ya soportados.

### Pipeline de ejecución

```
card_abilities.effects (JSONB)
        │
        ▼
  parseAbilityDef()          ← src/engine/abilities/AbilityDefinition.ts
        │
        ▼
  AbilityEngine.execute()    ← src/engine/abilities/AbilityEngine.ts
        │
        ├─ applyCosts()       ← descuenta cosmos del CP de la carta o descarta mano
        ├─ ConditionRegistry  ← src/engine/conditions/ConditionRegistry.ts
        ├─ ActionRegistry     ← src/engine/actions/ActionRegistry.ts
        └─ TargetResolver     ← src/engine/targets/TargetResolver.ts
```

### Esquema `AbilityDefinition`

```typescript
interface AbilityDefinition {
  trigger:     AbilityTrigger;   // 'ACTIVE' | 'CARD_PLAYED' | 'TURN_START' | etc.
  cost?:       CostDefinition[];    // Qué paga el jugador para activarla
  conditions?: ConditionDefinition[]; // AND: todas deben ser true
  actions:     ActionDefinition[];    // Qué pasa cuando se activa
}
```

### Triggers disponibles (`AbilityTrigger`)

| Trigger | Cuándo se dispara |
|---|---|
| `ACTIVE` | El jugador la activa manualmente |
| `CARD_PLAYED` | Al entrar la carta al campo |
| `TURN_START` | Al inicio del turno del jugador |
| `TURN_END` | Al final del turno del jugador |
| `KNIGHT_DIED` | Al morir cualquier caballero |
| `ALLY_DIED` | Al morir un aliado del dueño de la carta |
| `DAMAGE_DEALT` | Al aplicar daño |
| `DAMAGE_LETHAL` | Al recibir daño letal |

### Costos (`CostDefinition`)

```json
{ "type": "cosmos", "amount": 3 }      // Gasta 3 CP de la carta (≠ cosmos del jugador)
{ "type": "discard", "target": "self_hand" } // El jugador descarta 1 carta de su mano
{ "type": "life", "amount": 1 }         // Reservado (no implementado aún)
```

> ⚠️ `cosmos` aquí siempre es CP de la **carta** (`card.current_cosmos`), nunca el recurso global del jugador.

### Condiciones (`ConditionDefinition`)

| Tipo | Parámetros | Evalúa |
|---|---|---|
| `cosmos_min` | `amount: N` | La carta tiene ≥ N CP |
| `has_status` | `status: string` | La carta tiene ese `StatusEffectType` activo |
| `no_status` | `status: string` | La carta NO tiene ese status |
| `hand_not_empty` | — | El jugador tiene ≥ 1 carta en mano |
| `field_not_empty` | — | El jugador tiene ≥ 1 caballero en campo |
| `self_in_zone` | `zone: string` | La carta fuente está en esa zona |
| `hp_below` | `amount: N` | HP actual de la carta ≤ N |
| `enemy_has_status` | `status: string` | El objetivo (o cualquier rival) tiene ese status |

Las condiciones se evalúan en **AND**. Para registrar una nueva: `ConditionRegistry.register('mi_condicion', fn)`.

### Acciones (`ActionDefinition`)

#### `apply_status`
```json
{ "type": "apply_status", "status": "ignore_armor", "target": "self" }
{ "type": "apply_status", "status": "burn", "target": "target", "value": 1, "duration": 3 }
```

| Parámetro | Opciones | Default |
|---|---|---|
| `target` | `self` / `target` / `all_allies` / `all_enemies` | `self` |
| `duration` | N turnos (`remaining_turns`) | `null` (permanente) |
| `value` | Magnitud para efectos tipo `stat` o `burn` | — |

Stacking: mismo `type+source` → **refresh** (no duplica). Distinto `source` → acumula.

#### `coin_flip_then`
```json
{
  "type": "coin_flip_then",
  "on_heads": [ /* acciones si cara */ ],
  "on_fail":  [ /* acciones si cruz */ ]
}
```
Result accesible en `extras.coin_flip_result` (`'heads'` o `'tails'`).

### Efectos de entrada al campo (pasivas `CARD_PLAYED`)

`AbilityEngine.getCardEntryEffects()` lee todas las habilidades con `trigger: CARD_PLAYED` de la carta y convierte las acciones `apply_status` a `StatusEffect[]`. Estos se aplican en `CardManager.playCard()` automáticamente.

> **No existe más el `PASSIVE_EFFECT_MAP`**. El comportamiento está completamente en el JSONB.

---

## 3. Sistema de efectos de estado (StatusEffects)

Los `StatusEffect` son el mecanismo central para buffs, debuffs y modos de combate. Se guardan como JSONB en `cards_in_play.status_effects`.

```typescript
interface StatusEffect {
  type: StatusEffectType;
  value?: number;          // Magnitud del boost (para ce_boost, ar_boost, hp_boost)
  /**
   * Ticks restantes antes de que expire.
   * `null` = permanente: nunca se decrementa ni elimina por el tick de turno.
   */
  remaining_turns: number | null;
  source?: string;         // instance_id de carta que lo aplicó (opcional)
}
```

### Categorías (`StatusEffectCategory`)

```typescript
export type StatusEffectCategory = 'mode' | 'stat' | 'trigger' | 'special';

export const EFFECT_CATEGORY: Record<StatusEffectType, StatusEffectCategory>
// Punto único de verdad: tipo → categoría. Usar esto en lugar de strings hardcodeados.
```

### Tipos disponibles — `StatusEffectType`

| Tipo | Categoría | Cuándo expira | Qué hace |
|---|---|---|---|
| `defense` | `mode` | Al inicio del turno propio | Modo Defensa: daño = `ceil(CE_ataque/2) - AR` |
| `evasion` | `mode` | Al inicio del turno propio | Modo Evasión: 50% chance de esquivar BA |
| `prayer` | `mode` | Reservado | Oración Divina (TBD) |
| `ce_boost` | `stat` | Configurable | Suma `value` al CE del portador |
| `ar_boost` | `stat` | Configurable | Suma `value` al AR del portador |
| `hp_boost` | `stat` | Configurable | Suma `value` al HP máximo |
| `ignore_armor` | `special` | **Al atacar** (se consume) | El próximo BA ignora la AR del defensor |
| `last_stand_active` | `special` | 1 turno | Inmunidad total a daño; al expirar queda con 1 HP |
| `unicorn_horn` | `trigger` | `null` (permanente) | Cada BA que conecta causa +1 DIP al jugador rival |
| `herd_effect` | `trigger` | `null` (permanente) | Al causar DIP directo, causa +1 DIP extra adicional |
| `burn` | `trigger` | N turnos (`remaining_turns`) | Causa `value` HP de daño al portador al inicio de su turno |
| `phoenix_rebirth` | `trigger` | `null` (permanente) | Marcador de Ikki. Habilita Phoenix Flames. Trigger de Return (Fase 3) |
| `last_stand` | `trigger` | `null` (permanente) | Marcador de Seiya. Habilita Justice Fist. Al recibir golpe letal activa `last_stand_active` |

### Funciones helper exportadas

```typescript
export function parseStatusEffects(raw: unknown): StatusEffect[]
export function tickStatusEffects(effects: StatusEffect[]): StatusEffect[]  // efectos null se omiten
export function setModeEffect(effects, mode, remaining_turns?, source?): StatusEffect[]
export function deriveModeFromEffects(effects): 'normal'|'defense'|'evasion'|'prayer'
export function computeCeBonus(effects: StatusEffect[]): number  // suma todos los ce_boost
export function computeArBonus(effects: StatusEffect[]): number  // suma todos los ar_boost
export function getEffectsByCategory(effects, category): StatusEffect[]
export const MODE_EFFECT_TYPES: StatusEffectType[]  // ['defense', 'evasion', 'prayer']
```

### Ciclo de vida de los efectos

```
Carta entra al campo
  └─ CardManager.playCard():
       AbilityEngine.getCardEntryEffects() → StatusEffect[] desde AbilityDefinition CARD_PLAYED

Jugador activa habilidad activa
  └─ KnightRulesEngine.useAbility() → AbilityEngine.execute() → ActionRegistry
       → aplica StatusEffect (ej: ignore_armor, burn)

Jugador declara BA
  └─ CombatResolvers: lee ignore_armor del atacante → usa AR=0 si presente
  └─ AttackRulesEngine: borra ignore_armor tras atacar
  └─ AttackRulesEngine: lee unicorn_horn → suma +1 DIP al jugador defensor
  └─ AttackRulesEngine: lee herd_effect → +1 DIP adicional si ya hay DIP

Fin de turno
  └─ TurnRulesEngine: tickStatusEffects() decrementa remaining_turns
  └─ remaining_turns === null → OMITIDO (permanente)
  └─ remaining_turns === 0 → eliminado
  └─ mode, ce, ar se recomputan desde los efectos restantes
```

---

## 4. Paso a paso: agregar una carta al seed

### 4.1 Declarar la variable en el bloque `DECLARE`

El seed está envuelto en un bloque `DO $$ ... $$` de PostgreSQL. Para capturar el `id` de un `INSERT ... RETURNING id`, PostgreSQL requiere una variable de tipo `UUID` declarada en el bloque `DECLARE`. Sin ella, no hay forma de referenciar el nuevo ID en los `INSERT` de tablas hijas (`card_knights`, `card_abilities`).

```sql
-- Al inicio del bloque DO $$
DECLARE
  v_jabu   UUID;
  v_nuevo  UUID;   -- ← agregar aquí por cada carta nueva
```

### 4.2 Insertar la carta base

```sql
INSERT INTO cards (name, type, rarity, cost, generate, description, image_url, faction, element)
  VALUES ('Nombre', 'knight', 'common', 2, 2, 'Descripción.', 'bronzes/imagen.png', 'Athena', 'steel')
  RETURNING id INTO v_nuevo;
```

> Si `generate = 0`, puedes omitir la columna (toma el default).

### 4.3 Insertar stats de caballero (solo si `type = 'knight'`)

Los valores corresponden exactamente a lo que está en la carta física:

```sql
--                                           CE  AR  HP  CP
INSERT INTO card_knights (card_id, attack, defense, health, cosmos, can_defend, defense_reduction, rank)
  VALUES (v_nuevo,  2,   2,   6,   6,  TRUE, 0.5, 'Bronze Saint');
--                  ↑CE  ↑AR  ↑HP  ↑CP                         ↑rank
```

> `rank` es obligatorio. Ver tabla de rangos en sección 1.

### 4.4 Insertar habilidades

El campo `effects` ahora almacena un `AbilityDefinition` completo. El campo `conditions` heredado se mantiene por compatibilidad pero **la lógica real está en `effects.conditions`**.

**Habilidad activa (ejemplo: Match 1):**
```sql
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_nuevo, 'Match 1', 'activa',
   'Ignora la Defensa del oponente en el próximo Básico.',
   '{"cosmos_min": 3}',
   '{
     "trigger": "ACTIVE",
     "cost": [{"type": "cosmos", "amount": 3}],
     "conditions": [
       {"type": "cosmos_min", "amount": 3},
       {"type": "has_status", "status": "unicorn_horn"}
     ],
     "actions": [
       {"type": "apply_status", "status": "ignore_armor", "target": "self"}
     ]
   }');
```

**Habilidad pasiva (ejemplo: Cuerno de Unicornio):**
```sql
INSERT INTO card_abilities (card_id, name, type, description, conditions, effects) VALUES
  (v_nuevo, 'Cuerno de Unicornio', 'pasiva',
   'Cada Básico exitoso causa 1 DIP extra al jugador rival.',
   '{}',
   '{
     "trigger": "CARD_PLAYED",
     "actions": [
       {"type": "apply_status", "status": "unicorn_horn", "target": "self"}
     ]
   }');
```

**Habilidad pasiva con marcador permanente (phoenix_rebirth):**
```sql
'{
  "trigger": "CARD_PLAYED",
  "actions": [
    {"type": "apply_status", "status": "phoenix_rebirth", "target": "self"}
  ]
}'
```

> Para habilidades de escenario (`type='campo'`), usar `trigger: CARD_PLAYED` con efectos de `ce_boost`/`ar_boost` y condiciones de aura en el campo `effects.aura` (ver FieldEffectsEngine, Fase 2).

---

## 5. Paso a paso: implementar una habilidad nueva

### Decisión inicial: ¿es un efecto ya soportado?

> Si el `StatusEffectType` ya existe y las acciones requeridas están en `ActionRegistry` → **solo es necesario escribir el JSONB en el seed, sin tocar código TypeScript**.

Si el efecto requiere lógica nueva en combate (ej: cambia el cálculo de daño), seguir los pasos 5.1–5.3. Para efectos que solo aplican/quitan StatusEffects, ir directo al paso 5.4.

---

### 5.1 Definir el `StatusEffectType` _(solo si el efecto es nuevo)_

**Archivo:** `src/engine/StatusEffects.ts`

```typescript
export type StatusEffectType =
  | 'defense'
  | 'evasion'
  // ...
  | 'mi_nuevo_efecto';  // ← agregar aquí con comentario de categoría

export const EFFECT_CATEGORY: Record<StatusEffectType, StatusEffectCategory> = {
  // ...
  mi_nuevo_efecto: 'trigger',  // ← 'mode' | 'stat' | 'trigger' | 'special'
};
```

### 5.2 Registrar el efecto en combate _(solo si modifica el cálculo de daño)_

**Archivo:** `src/engine/combat/CombatResolvers.ts`

Si el efecto cambia cómo se calcula el daño (como `ignore_armor`), modificar el resolver correspondiente:

```typescript
normal: (ctx, rng) => {
  const ignores = _attackerIgnoresArmor(ctx);  // función helper existente
  const effectiveAR = ignores ? 0 : (ctx.defender?.ar ?? 0);
  // ...
},
```

### 5.3 Gestionar el ciclo de vida en `AttackRulesEngine` _(solo si el efecto interactúa con el combate)_

**Archivo:** `src/engine/AttackRulesEngine.ts`

Si el efecto se consume al atacar o genera DIP extra:

```typescript
// Detectar ANTES de resolver
const hadEffect = (attacker.status_effects ?? []).some(e => e.type === 'mi_nuevo_efecto');

// ... resolución del combate ...

// Consumir después de resolver (para efectos tipo 'special' que se consumen al usarse)
if (hadEffect) {
  attacker.status_effects = (attacker.status_effects ?? [])
    .filter(e => e.type !== 'mi_nuevo_efecto');
}
```

### 5.4 Escribir el `AbilityDefinition` en el seed (obligatorio siempre)

Este es el **único paso requerido** para efectos ya soportados. El `AbilityEngine` interpretará automáticamente la definición.

**Pasiva que aplica un status al entrar en campo:**
```json
{
  "trigger": "CARD_PLAYED",
  "actions": [
    { "type": "apply_status", "status": "mi_nuevo_efecto", "target": "self" }
  ]
}
```

**Activa con costo de cosmos de la carta:**
```json
{
  "trigger": "ACTIVE",
  "cost": [{ "type": "cosmos", "amount": 3 }],
  "conditions": [
    { "type": "cosmos_min", "amount": 3 },
    { "type": "has_status", "status": "mi_prerequisito" }
  ],
  "actions": [
    { "type": "apply_status", "status": "mi_nuevo_efecto", "target": "self" }
  ]
}
```

**Activa con costo de descarte:**
```json
{
  "trigger": "ACTIVE",
  "cost": [{ "type": "discard", "target": "self_hand" }],
  "conditions": [
    { "type": "has_status", "status": "mi_prerequisito" },
    { "type": "hand_not_empty" }
  ],
  "actions": [
    { "type": "apply_status", "status": "mi_nuevo_efecto", "target": "self" }
  ]
}
```

### 5.5 Registrar una nueva acción _(solo si el tipo de acción no existe)_

**Archivo:** `src/engine/actions/ActionRegistry.ts`

Si necesitás una acción que no sea `apply_status` ni `coin_flip_then`:

```typescript
ActionRegistry.register('mi_nueva_accion', (action, ctx, result) => {
  const targets = TargetResolver.resolve(action.target ?? 'self', {
    state: result.state, playerNumber: ctx.playerNumber,
    sourceCardId: ctx.sourceCardId, event: ctx.event,
  });
  for (const card of targets) {
    // ... mutar result.state ...
    result.affectedIds.push(card.instance_id);
  }
  result.extras.mi_resultado = true;
});
```

> **`affectedIds`** — instancias cuyo estado cambió. `KnightManager` persiste automáticamente en BD los `status_effects`, `current_cosmos` y `current_health` de todas las cartas listadas.
>
> **`extras`** — datos opcionales para el cliente (ej: `coin_flip_result`, `burn_applied`). Se propagan en el evento WebSocket vía `_buildMatchUpdateResult`.

### 5.6 Registrar una nueva condición _(solo si la condición no existe)_

**Archivo:** `src/engine/conditions/ConditionRegistry.ts`

```typescript
ConditionRegistry.register('mi_condicion', (cond, ctx) => {
  // ctx tiene: sourceCard, player, opponent?, targetCard?, event
  return ctx.sourceCard.current_health <= (cond.amount ?? 0);
});
```

### 5.7 Exponer la habilidad al cliente (ActionResolver)

**Archivo:** `src/game/abilities/AbilityRegistry.ts`

Para que la habilidad aparezca en `active_abilities` del payload al cliente, agregarla al registro:

```typescript
export const AbilityRegistry: Ability[] = [
  // ...
  {
    name: 'mi_habilidad',       // debe coincidir con card_abilities.name en BD
    cosmos_cost: 3,             // CP de la carta (no del jugador)
    requires_target: true,      // true si el cliente debe enviar targetId
    canUse(ctx) { return /* validación rápida para UI */ true; },
  },
];
```

El `ActionResolver._resolveAbilities()` propagará `requires_target` y `cosmos_cost` automáticamente al cliente. La validación definitiva siempre ocurre en `AbilityEngine.canActivate()` en el servidor.

---

## 6. Archivos involucrados (mapa rápido)

### Datos (seed)
```
database/seed.sql                          ← Datos y AbilityDefinition JSONB de cada carta
```

### Motor puro (sin BD, sin red)
```
src/engine/StatusEffects.ts                ← Tipos, EFFECT_CATEGORY, helpers (tick, computeCe/Ar, etc.)
src/engine/combat/CombatResolvers.ts       ← Cómo cada modo defensivo calcula el daño
src/engine/AttackRulesEngine.ts            ← Flujo completo de ataque / modos defensivos
src/engine/KnightRulesEngine.ts            ← chargeKnightCosmos, sacrifice, useAbility → AbilityEngine
src/engine/CardRulesEngine.ts              ← validatePlayCard / executePlayCard / moveCard
src/engine/TurnRulesEngine.ts              ← tick de efectos, cambio de turno
src/engine/FieldEffectsEngine.ts           ← Bonos de escenarios e items por slot (Fase 2 pendiente)
```

### Sistema declarativo de habilidades
```
src/engine/abilities/AbilityDefinition.ts  ← Esquema TypeScript de AbilityDefinition (trigger/cost/conditions/actions)
src/engine/abilities/AbilityEngine.ts      ← canActivate / execute / getCardEntryEffects
src/engine/actions/ActionRegistry.ts       ← Ejecutores de acciones: apply_status, coin_flip_then
src/engine/conditions/ConditionRegistry.ts ← Evaluadores de condiciones: cosmos_min, has_status, etc.
src/engine/targets/TargetResolver.ts       ← self / target / all_allies / all_enemies
src/engine/events/GameEvents.ts            ← GameEventType / GameEvent (estructura de todos los eventos)
```

### Utilidades
```
src/utils/ZoneMapper.ts                    ← 'field_technique' ↔ 'field_support' + ZONE_LIMITS
```

### Orquestación con BD
```
src/services/game/cardManager.ts           ← playCard / discardCard / moveCard (con transacciones)
src/services/game/knightManager.ts         ← Wrapper transaccional: attack, useAbility, move
src/services/coordinators/matchCoordinator.ts   ← Métodos públicos: attack, useKnightAbility, etc.
src/services/coordinators/matchesCoordinator.ts ← Router de acciones (switch USE_ABILITY, ATTACK, etc.)
src/services/websocket/websocket.service.ts     ← Mapeado del evento WS → coordinador
src/services/game/ActionResolver.ts             ← Exponer active_abilities al cliente + zonas disponibles
```

### Registro de habilidades concretas (para ActionResolver)
```
src/game/abilities/AbilityRegistry.ts      ← [ Match1Ability, PhoenixFlamesAbility, JusticeFistAbility ]
src/game/abilities/match1.ability.ts       ← Match 1 (Jabu / Nachi)
src/game/abilities/phoenix-flames.ability.ts ← Phoenix Flames (Ikki) — coin flip + burn
src/game/abilities/justice-fist.ability.ts   ← Justice Fist (Seiya) — descarte + ignore_armor
```

---

## 7. Checklist de implementación

### Carta sin mecánicas nuevas (solo stats)
- [ ] Variable UUID en `DECLARE` del seed
- [ ] `INSERT INTO cards` con `cost`, `generate`, `image_url`, `element`
- [ ] `INSERT INTO card_knights` con CE / AR / HP / CP / **rank**
- [ ] (Si pasiva standard) `INSERT INTO card_abilities` con `effects` JSONB

### Carta con pasiva nueva
- [ ] Todo lo anterior
- [ ] Nuevo `StatusEffectType` en `StatusEffects.ts`
- [ ] Reconocimiento JSONB → StatusEffect en `CardManager.playCard()`
- [ ] Lógica del efecto en `CombatResolvers.ts` y/o `AttackRulesEngine.ts`

### Carta con habilidad activa nueva
- [ ] Todo lo anterior (pasiva o stats)
- [ ] Nueva entrada en `ABILITY_HANDLERS` en `KnightRulesEngine.ts` (no tocar los métodos públicos)
- [ ] Registrar en `AbilityRegistry.ts` (con `requires_target: true` si el cliente debe enviar un objetivo)
- [ ] _(El resto de la cadena KnightManager → MatchCoordinator → MatchesCoordinator ya soporta `targetId` y `affectedIds` genéricamente — no requiere cambios)_
- [ ] Si la habilidad tiene **costo de descarte**: el handler de’ve retornar `extras.discard_card_id` — `KnightManager` lo procesa automáticamente en el paso 7c

### Carta de escenario o con aura de campo ('stage')
- [ ] Variable UUID en `DECLARE` del seed
- [ ] `INSERT INTO cards` con `type='stage'`
- [ ] `INSERT INTO card_abilities` con `type='campo'` y `effects.field_aura`
  - `field_aura` puede filtrar por `rank`, `element` o `faction`
- [ ] El `ActionResolver` ya rutea `stage` → `field_scenario` automáticamente
- [ ] **Phase 2 pendiente**: integrar `FieldEffectsEngine.getScenarioBonuses()` en el pipeline de combate

### Carta de objeto/equipamiento ('item')
- [ ] Variable UUID en `DECLARE` del seed
- [ ] `INSERT INTO cards` con `type='item'`
- [ ] `INSERT INTO card_abilities` con `type='equipamiento'` o `type='campo'`
- [ ] El `ActionResolver` ya rutea `item` → slots de `field_technique` automáticamente
- [ ] **Phase 2 pendiente**: integrar `FieldEffectsEngine.getItemBonuses()` en el pipeline de combate
- [ ] **Phase 2 pendiente**: mover objeto al yomotsu cuando muere el caballero asociado (`KnightManager`)

---

## Ejemplo de referencia completo: Jabu de Unicornio

### Carta en la imagen
```
Costo: 2 / Genera: 2  →  cost=2, generate=2
CE: 2  AR: 2  (en card_knights)
HP: 6  CP: 6  (en card_knights)
```

### Habilidad "Match 1" (activa)
- **Cost**: 3 **CP** (Cosmos Points de la carta, campo `current_cosmos`), no cosmos del jugador
- **Efecto**: el próximo AB del portador ignora la AR del defensor
- **Implementación**: aplica `StatusEffect('ignore_armor', remaining_turns=null)`, se consume en `AttackRulesEngine.attack()`. La validación usa `card.current_cosmos < 3`.

### Habilidad "Cuerno de Unicornio" (pasiva)
- **Cost**: 0 (se activa al entrar en campo)
- **Efecto**: cada BA del portador que **conecta** causa 1 DIP adicional al jugador rival
- **effects JSONB en seed**:
  ```json
  { "trigger": "CARD_PLAYED", "actions": [{ "type": "apply_status", "status": "unicorn_horn", "target": "self" }] }
  ```
- **Implementación**: `AbilityEngine.getCardEntryEffects()` (llamado desde `CardManager.playCard()`) genera `StatusEffect('unicorn_horn', remaining_turns=null)`. `AttackRulesEngine.attack()` lo lee y suma `+1` a `damageToPlayer` **solo si el ataque no fue esquivado** (`!evaded`).

---

## Ejemplo de referencia: Nachi de Lobo

### Carta
```
Costo: 0 / Genera: 2  →  cost=0, generate=2  →  puede jugarse con 0 cosmos
CE: 2  AR: 1  HP: 7  CP: 6  (en card_knights)
rank: 'Bronze Saint'
```

### Habilidad "Efecto Manada" (pasiva)
- **Efecto**: cuando el portador causa DIP directo al jugador rival, causa 1 DIP extra adicional.
- **effects JSONB en seed**:
  ```json
  { "trigger": "CARD_PLAYED", "actions": [{ "type": "apply_status", "status": "herd_effect", "target": "self" }] }
  ```
- **Implementación**: `AbilityEngine.getCardEntryEffects()` genera `StatusEffect('herd_effect', remaining_turns=null)`. `AttackRulesEngine` lo lee y suma +1 DIP extra **solo si el ataque no fue esquivado**.

---

## Ejemplo de referencia: El Santuario (escenario con aura)

### Carta
```
tipo: stage
Costo: 0 / Genera: 0
zona: field_scenario (compartida, 1 por partida)
```

### Habilidad "Tierra Sagrada" (campo)
- **Efecto JSONB**: `{"field_aura":{"rank":"Steel Saint","ce":2,"ar":2}}`
- **Cómo funciona (Phase 2)**: `FieldEffectsEngine.getScenarioBonuses()` evaluará el aura en tiempo de combate y retornará +2 CE / +2 AR a todos los caballeros `Steel Saint` de ambos jugadores.
- **Estado actual**: la carta se puede jugar y ocupa `field_scenario`, pero el aura no tiene efecto en combate hasta que se integre `FieldEffectsEngine` (Phase 2).

---

## Ejemplo de referencia: Ikki de Fénix

### Carta
```
Costo: 0 / Genera: 0  →  cost=0, generate=0
CE: 4  AR: 2  HP: 8  CP: 7  (en card_knights)
rank: 'Bronze Saint'  element: 'steel'
```

### Habilidad "Phoenix Flames" (activa, requiere objetivo)
- **Cost**: 3 CP de la carta (`current_cosmos`)
- **Requiere objetivo**: sí — un caballero rival en `field_knight`. El cliente envía `targetId`.
- **Efecto**: coin flip 50/50. Si cara → aplica `StatusEffect('burn', value=1, remaining_turns=3)` al objetivo. Si cruz → solo consume los 3 CP.
- **effects JSONB en seed**:
  ```json
  {
    "trigger": "ACTIVE",
    "cost": [{"type": "cosmos", "amount": 3}],
    "conditions": [{"type": "cosmos_min", "amount": 3}, {"type": "has_status", "status": "phoenix_rebirth"}],
    "actions": [{
      "type": "coin_flip_then",
      "on_heads": [{"type": "apply_status", "status": "burn", "target": "target", "value": 1, "duration": 3}],
      "on_fail": []
    }]
  }
  ```
- **Implementación**: `AbilityEngine.execute()` delega en `ActionRegistry` → `coin_flip_then` → si cara aplica burn al `target` resuelto por `TargetResolver`. Devuelve `affectedIds` con las cartas afectadas y `extras.coin_flip_result`.
- **AbilityRegistry**: registrado con `requires_target: true` → `ActionResolver` lo expone al cliente correctamente.

### Habilidad "Return" (pasiva, parcialmente implementada)
- **Efecto**: cuando un aliado muere, Ikki regresa del Yomotsu al campo de batalla.
- **effects JSONB en seed** (marcador permanente):
  ```json
  { "trigger": "CARD_PLAYED", "actions": [{ "type": "apply_status", "status": "phoenix_rebirth", "target": "self" }] }
  ```
- **Implementación actual**: `AbilityEngine.getCardEntryEffects()` aplica `StatusEffect('phoenix_rebirth', remaining_turns=null)` al entrar al campo.
- **Pendiente (Fase 3)**: el trigger real (`trigger: ALLY_DIED` → Ikki regresa del yomotsu) requiere hookear el `GameEventType.KNIGHT_DIED` en el pipeline. Hay un `TODO` en `KnightManager`.

---

## Ejemplo de referencia: Seiya de Pegaso

### Carta
```
Costo: 0 / Genera: 2  →  cost=0, generate=2
CE: 3  AR: 2  HP: 9  CP: 8  (en card_knights)
rank: 'Bronze Saint'  element: 'steel'
```

### Habilidad "Justice Fist" (activa, costo de descarte)
- **Cost**: descartar 1 carta de la mano propia (no CP). El cliente envía `targetId` = `instance_id` de la carta a descartar.
- **Efecto**: aplica `StatusEffect('ignore_armor', remaining_turns=null)` al portador → se consume al realizar el próximo BA.
- **effects JSONB en seed**:
  ```json
  {
    "trigger": "ACTIVE",
    "cost": [{"type": "discard", "target": "self_hand"}],
    "conditions": [{"type": "has_status", "status": "last_stand"}, {"type": "hand_not_empty"}],
    "actions": [{"type": "apply_status", "status": "ignore_armor", "target": "self"}]
  }
  ```
- **Implementación**: `AbilityEngine.execute()` → `applyCosts()` retira la carta `targetId` de `player.hand` en el estado y guarda `extras.discard_card_id = targetId`. `KnightManager` lo lee y mueve la carta a zona `'yomotsu'` en BD.
- **AbilityRegistry**: `cosmos_cost: 0`, `requires_target: true` (el cliente elige qué carta descartar).

### Habilidad "Inner Determination" (pasiva, sin EventBus)
- **Efecto**: al recibir un golpe letal, el caballero sobrevive con 1 HP e inmunidad total a daño durante 1 turno.
- **effects JSONB en seed** (marcador permanente):
  ```json
  { "trigger": "CARD_PLAYED", "actions": [{ "type": "apply_status", "status": "last_stand", "target": "self" }] }
  ```
- **Implementación** (completamente funcional sin EventBus):
  - `AbilityEngine.getCardEntryEffects()` (desde `CardManager.playCard()`) genera `StatusEffect('last_stand', remaining_turns=null)`.
  - `AttackRulesEngine.attack()`: antes de la resolución del combate, detecta `last_stand_active` en el defensor → bloquea todo daño (`!hasLastStandActive`).
  - Cuando el daño reduce `current_health ≤ 0` y el defensor tiene `last_stand`: en lugar de morir, recibe `current_health = 1`, se elimina `last_stand`, se aplica `last_stand_active { remaining_turns: 1 }`. No va al yomotsu, no causa DIP.
  - `TurnRulesEngine.tickStatusEffects()` decrementa `last_stand_active` de 1 → 0 → expira automáticamente. Tras eso, el caballero tiene 1 HP y puede morir normalmente.
