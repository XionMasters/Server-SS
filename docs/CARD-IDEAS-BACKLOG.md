# Card Ideas Backlog

Documento para guardar ideas de cartas y convertirlas despues en implementaciones reales.

## Como usar este archivo

1. Agrega una idea rapida en "Inbox" cuando se te ocurra algo.
2. Cuando la idea madure, movela a "Ideas Detalladas".
3. Cuando este lista para desarrollo, pasala a "Lista para Implementar".
4. Mantene los valores internos en ingles para compatibilidad del proyecto.

## Valores internos validos

- type: `knight`, `technique`, `item`, `stage`, `helper`, `event`
- rarity: `common`, `rare`, `epic`, `legendary`, `divine`
- element: `steel`, `fire`, `water`, `earth`, `wind`, `light`, `dark`

---

## Inbox (ideas rapidas)

| Fecha | Nombre tentativo | Idea corta | Owner | Estado |
|---|---|---|---|---|
| YYYY-MM-DD | | | | nueva |

---

## Ideas Detalladas

### Plantilla de idea

```md
### [IDEA-XXX] Nombre de la carta
- Estado: borrador | validando | lista
- Tipo (interno): knight | technique | item | stage | helper | event
- Rareza (interna): common | rare | epic | legendary | divine
- Faccion: Athena | Poseidon | Hades | etc
- Elemento: steel | fire | water | earth | wind | light | dark
- Costo: 0-10

#### Fantasia / Identidad
- Que representa en el lore:
- Rol en partida:

#### Texto visible (ES)
- Nombre:
- Descripcion corta:

#### Texto visible (EN)
- Name:
- Short description:

#### Texto visible (PT)
- Nome:
- Descricao curta:

#### Efectos (diseno)
- Trigger principal:
- Accion principal:
- Restricciones:
- Condiciones:

#### Habilidades / Tecnicas
- Habilidad 1:
  - Tipo: pasiva | activa | equipamiento | campo
  - Efecto:
- Habilidad 2:
  - Tipo: pasiva | activa | equipamiento | campo
  - Efecto:

#### Balance inicial
- Curva de poder esperada:
- Counterplay esperado:
- Riesgo de abuso:

#### Notas tecnicas (backend)
- Estructura sugerida en `effects` JSONB:
- Estructura sugerida en `conditions` JSONB:
- Dependencias con mecanicas actuales:

#### Checklist de implementacion
- [ ] Crear/actualizar card base
- [ ] Agregar traducciones ES/EN/PT
- [ ] Definir `card_knight` (si aplica)
- [ ] Definir `card_abilities` (si aplica)
- [ ] Agregar en script/seed correspondiente
- [ ] Probar en partida real
```

### [IDEA-001] (ejemplo) Escudo de Libra
- Estado: borrador
- Tipo (interno): technique
- Rareza (interna): rare
- Faccion: Athena
- Elemento: light
- Costo: 2

#### Fantasia / Identidad
- Que representa en el lore: defensa absoluta de Libra.
- Rol en partida: proteger un caballero clave por 1 turno.

#### Texto visible (ES)
- Nombre: Escudo de Libra
- Descripcion corta: Reduce dano recibido y evita un efecto negativo.

#### Efectos (diseno)
- Trigger principal: al activarse en campo.
- Accion principal: aplicar reduccion de dano al objetivo aliado.
- Restricciones: solo sobre `field_knight` aliado.
- Condiciones: objetivo debe estar vivo.

#### Habilidades / Tecnicas
- Habilidad 1:
  - Tipo: activa
  - Efecto: el objetivo recibe 50% menos dano hasta fin de turno.

#### Balance inicial
- Curva de poder esperada: media.
- Counterplay esperado: remover la tecnica o cambiar objetivo.
- Riesgo de abuso: acumulacion de mitigacion.

#### Notas tecnicas (backend)
- Estructura sugerida en `effects` JSONB:
  - `{ "trigger": "ON_ACTIVATE", "actions": [{ "type": "APPLY_STATUS", "status": "defense", "value": 0.5, "duration_turns": 1 }] }`
- Estructura sugerida en `conditions` JSONB:
  - `{ "target_zone": "field_knight", "target_side": "ally" }`

#### Checklist de implementacion
- [ ] Crear/actualizar card base
- [ ] Agregar traducciones ES/EN/PT
- [ ] Definir `card_knight` (si aplica)
- [ ] Definir `card_abilities` (si aplica)
- [ ] Agregar en script/seed correspondiente
- [ ] Probar en partida real

---

## Lista para Implementar

| Prioridad | Idea ID | Nombre | Tipo | Rareza | Esfuerzo (S/M/L) | Estado |
|---|---|---|---|---|---|---|
| P2 | IDEA-001 | Escudo de Libra | technique | rare | M | pendiente |
| P1 | IDEA-002 | Seiya — Milagro/Encendido | knight | epic | S | motor listo, JSON pendiente |
| P1 | IDEA-003 | Meteoros de Pegaso | technique | rare | M | seeded, motor TA pendiente |
| P3 | IDEA-004 | Coliseo de la Fundación Graude | stage | rare | L | seeded, efectos pendientes |
| P1 | IDEA-005 | Precio de Sangre | occasion | common | S | ✅ implementada |
| P2 | IDEA-006 | Caballero Inmortal (Aiolos?) | knight | legendary | M | borrador |

---
## Cambios / Historial

- YYYY-MM-DD: creado backlog inicial de ideas.
- 2026-04-12: ideas desarmadas organizadas en IDEA-002 a IDEA-006. Meteoros de Pegaso (IDEA-003), Coliseo (IDEA-004) y Precio de Sangre (IDEA-005) implementados en JSON. Condición `player_lp_below` y acción `restore_cosmos` agregadas al motor para soportar IDEA-002.

---

### [IDEA-002] Seiya — Milagro y Encendido de Cosmos
- Estado: validando
- Tipo (interno): knight
- Rareza (interna): epic
- Faccion: Athena
- Elemento: fire
- Costo: 0

#### Fantasía / Identidad
- Que representa en el lore: el espíritu indomable de Seiya, más peligroso cuanto más cerca está de la derrota.
- Rol en partida: atacante que escala como "last resort"; presiona al rival a no desgastar vida propia.

#### Texto visible (ES)
- Nombre: Seiya de Pegaso
- Descripcion corta: Si el jugador tiene 4 o menos PLP, Seiya despierta su cosmos y sus golpes atraviesan la armadura rival.

#### Efectos (diseño)
- Trigger principal: CARD_PLAYED (evaluación de LP al entrar) + activa manual.
- Acción principal (Milagro): si `player_lp_below:4` al entrar → `ce_boost +2` + `ignore_armor` en self.
- Acción principal (Encendido): paga 2 PCP (`player_cosmos`) → `restore_cosmos self 4` (restaura 4 CP del caballero).

#### Habilidades
- Habilidad 1 — Milagro:
  - Tipo: pasiva
  - Condición: `player_lp_below: 4`
  - Efectos: `apply_status ce_boost +2` + `apply_status ignore_armor` en self
  - _Nota_: la condición se evalúa al CARD_PLAYED; no reacciona dinámicamente si la vida baja después.
- Habilidad 2 — Encendido de Cosmos:
  - Tipo: activa
  - Costo: `{ type: "player_cosmos", amount: 2 }` (2 PCP del jugador)
  - Efectos: `restore_cosmos self 4` (4 CP del caballero)

#### Notas técnicas (backend)
- `player_lp_below` ✅ ya disponible en ConditionRegistry.
- `restore_cosmos` ✅ ya disponible en ActionRegistry.
- Pendiente: decidir si estas habilidades reemplazan las de `seiya_pegasus_v1` (imagen) o van en una versión separada.

#### Checklist de implementación
- [ ] Crear/actualizar card base
- [ ] Agregar traducciones ES/EN/PT
- [ ] Definir `card_knight` (si aplica)
- [ ] Definir `card_abilities` (si aplica)
- [ ] Agregar en script/seed correspondiente
- [ ] Probar en partida real

---

### [IDEA-003] Meteoros de Pegaso
- Estado: implementada (parcial — TA engine pendiente)
- Tipo (interno): technique
- Rareza (interna): rare
- Faccion: Athena
- Elemento: fire
- Costo: 1

#### Fantasía / Identidad
- Que representa en el lore: el ataque más icónico de Seiya, golpes repetidos que abruman al rival.
- Rol en partida: técnica ofensiva multi-hit; devastadora contra baja AR, mínima contra alta AR.

#### Texto visible (ES)
- Nombre: Meteoros de Pegaso
- Descripcion corta: Compatible con [pegasus]. TA: Gasta 4 CP del caballero. Golpea 3 veces con CE 2 por golpe.

#### Efectos (diseño)
- Compatibilidad: `field_has_tag: "pegasus"` (cualquier versión de Seiya)
- TA: 3 hits × CE 2. Cada golpe aplica fórmula estándar `CE - AR = daño` (mínimo 1).
- Costo TA: 4 CP del caballero.

#### Notas técnicas (backend)
- Carta creada en `database/Santuario/techniques.json` con `technique_stats` declarado.
- `technique_stats.hit_count: 3`, `hit_ce: 2`, `ta_cost: 4`, `compatible_tags: ["pegasus"]`
- ❌ Motor TA no implementado aún. AttackRulesEngine solo procesa BA. IDEA-003 está seeded pero inactiva.
- Pendiente: Fase 2 — multi-hit TA en AttackRulesEngine con costo CP y fórmula por golpe.

#### Checklist de implementación
- [x] Crear/actualizar card base (`database/Santuario/techniques.json`)
- [ ] Agregar traducciones ES/EN/PT
- [ ] ~~Definir `card_knight`~~ (no aplica)
- [ ] Implementar motor TA en AttackRulesEngine
- [ ] Probar en partida real

---

### [IDEA-004] Coliseo de la Fundación Graude
- Estado: implementada (parcial — ambos efectos pending)
- Tipo (interno): stage
- Rareza (interna): rare
- Faccion: Athena
- Elemento: steel
- Costo: 3

#### Fantasía / Identidad
- Que representa en el lore: el escenario del torneo donde todo comenzó.
- Rol en partida: acelera el ritmo de juego recompensando la agresión; bufea ligeramente la evasión.

#### Efectos (diseño)
- Espíritu de Combate: al TURN_END, si el jugador activo atacó (BA o TA), gana +1 PCP.
- Regla del Coliseo: modificador global +10% probabilidad de esquivar BA en Modo Evasión.

#### Notas técnicas (backend)
- Carta creada en `database/Santuario/stages.json`.
- ❌ Ambos efectos pending: requieren trigger TURN_END + flag `attack_declared_this_turn` en GameState, y modificador global de evasión en AttackRulesEngine.

#### Checklist de implementación
- [x] Crear/actualizar card base (`database/Santuario/stages.json`)
- [ ] Agregar traducciones ES/EN/PT
- [ ] Implementar trigger TURN_END en AbilityEngine/PassiveTriggerEngine
- [ ] Implementar flag `attack_declared_this_turn` en GameState
- [ ] Implementar modificador global de evasión en AttackRulesEngine
- [ ] Probar en partida real

---

### [IDEA-005] Precio de Sangre
- Estado: implementada ✅
- Tipo (interno): occasion
- Rareza (interna): common
- Faccion: Athena
- Elemento: fire
- Costo: 0 PCP

#### Fantasía / Identidad
- Que representa en el lore: sacrificar sangre propia para herir al rival directamente.
- Rol en partida: carta cantrip agresiva de coste alternativo; útil para cerrar daño preciso a 0 PCP.

#### Efectos (diseño)
- Costo: 1 PLP propio (`cost.type: "life"`)
- Efecto: 1 daño directo al rival (`apply_player_damage target:"opponent" amount:1`)
- Ratio 1:1 — el valor está en el coste 0 PCP con CP ya gastado.

#### Notas técnicas (backend)
- Carta creada en `database/Santuario/occasions.json` como `blood_price`.
- ✅ Completamente implementable con acciones existentes.

#### Checklist de implementación
- [x] Crear/actualizar card base
- [ ] Agregar traducciones ES/EN/PT
- [x] Agregar en script/seed correspondiente
- [ ] Probar en partida real

---

### [IDEA-006] Caballero Inmortal (nombre pendiente, posible Aiolos)
- Estado: borrador
- Tipo (interno): knight
- Rareza (interna): legendary
- Faccion: Athena
- Elemento: light
- Costo: TBD

#### Fantasía / Identidad
- Que representa en el lore: un caballero que protege la vida del jugador con su mera presencia.
- Rol en partida: "escudo de vida" — mientras esté en campo, el jugador no puede ser eliminado.

#### Efectos (diseño)
- Habilidad pasiva: mientras este caballero esté en `field_knight`, el PLP del jugador no puede bajar de 1.
- Si el jugador recibe daño que lo llevaría a 0 o menos, queda en 1 en cambio.

#### Notas técnicas (backend)
- Requiere: modificador en `resolveWinCondition` o en la acción `apply_player_damage` que consulte si hay un caballero con status `life_floor_1` en el campo del jugador.
- Implementación sugerida:
  - `apply_status life_floor_1 target:self` al CARD_PLAYED
  - En `apply_player_damage` antes de aplicar: si `player.field_knights.some(k => k.status_effects.includes('life_floor_1'))` → `player.life = Math.max(1, player.life - amount)`
- Pendiente: implementar lógica in ActionRegistry.apply_player_damage.

#### Checklist de implementación
- [ ] Crear/actualizar card base
- [ ] Agregar traducciones ES/EN/PT
- [ ] Implementar lógica `life_floor_1` en ActionRegistry.apply_player_damage
- [ ] Agregar en script/seed correspondiente
- [ ] Probar en partida real



## Mas ideas para ordenar:
Caballero: Baian de Hipocampo

Tipo: Caballero – Marina General
Rol: Control / Defensa reactiva
Stats:
CE: 7
AR: 6
LP: 10
CP: 10
Costo:  5

Habilidad: Barrera de Corriente (Pasiva)
Barrera de Corriente
La primera vez que este caballero es objetivo de un BA (ataque basico) cada turno, lanza una moneda:
Cara: niega el daño, causa 2 Lp de daño al rival
Cruz: recibe la mitad de daño

Hanbilidad: God Breath (Activa) 
Costo: 2Cp
Mueve al caballero objetivo a otra posicion. Si esta en defensa, pierde ese estado.

Habilidad: Orgullo de Marina (Pasiva)
Mientras este caballero tenga su Lp completo, gana +2 CE.
Si recibe daño, pierde este bonus.

Técnica: Cyclone Maelstrom (del spin-off)
Costo: 3 CP
Durante el turno de tu rival, todos los ataques tienen 50% de fallar.
Al final del turno rival, todos los caballeros reciben 3 de daño.