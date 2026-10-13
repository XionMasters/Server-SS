# Roadmap de refactorización

## Propósito

Este documento es el plan operativo para recuperar el contexto del proyecto y
refactorizarlo de forma incremental hacia la arquitectura definida en
[`../.github/copilot-instructions.md`](../.github/copilot-instructions.md).

El documento [`ARCHITECTURE-REFACTOR.md`](./ARCHITECTURE-REFACTOR.md) conserva
el análisis técnico y las decisiones detalladas del refactor del juego. Este
archivo sirve para:

- registrar cómo está organizado actualmente el proyecto;
- definir a qué ubicación pertenece cada responsabilidad;
- marcar qué partes ya fueron migradas;
- evitar movimientos masivos sin entender las dependencias;
- documentar bloqueos, decisiones y validaciones.

## Cómo usar este documento

Estados permitidos:

- `[ ] Pendiente`
- `[-] En progreso`
- `[x] Completado`
- `[!] Bloqueado o requiere decisión`

Cada tarea debe hacerse de forma incremental. Antes de mover un módulo:

1. localizar sus importadores y consumidores;
2. identificar si forma parte de HTTP, WebSocket, aplicación, dominio o
   infraestructura;
3. definir una frontera clara;
4. mover o adaptar el código;
5. actualizar imports y documentación;
6. ejecutar compilación y pruebas relevantes;
7. marcar la tarea solo después de validar el comportamiento.

## Arquitectura actual observada

```text
src/
├── app.ts
├── server.ts
├── config/
├── controllers/
├── engine/
├── game/
├── middleware/
├── models/
├── routes/
├── scripts/
├── services/
└── utils/
```

### Inventario por responsabilidad

| Ubicación actual | Responsabilidad observada | Situación |
| --- | --- | --- |
| `src/server.ts` | Arranque HTTP, base de datos y WebSocket | Punto de entrada válido, pendiente de simplificar |
| `src/app.ts` | Configuración Express, middleware y rutas | Adaptador HTTP mezclado con configuración global |
| `src/routes/` | Definición de endpoints | Debe migrar a `interfaces/http/routes` |
| `src/controllers/` | Controllers HTTP | Debe migrar a `interfaces/http/controllers` |
| `src/middleware/` | Autenticación y validación HTTP | Debe separarse entre interfaces e infraestructura según su uso |
| `src/services/` | Casos de uso, coordinadores, managers, WebSocket, repositorios y serializers | Carpeta con responsabilidades mezcladas |
| `src/engine/` | Reglas, acciones, condiciones y eventos del juego | Candidato principal para `domain/game` |
| `src/game/` | Abilities y reglas heredadas o paralelas | Requiere consolidación con `domain/game` |
| `src/models/` | Modelos Sequelize y asociaciones | Candidato para `infrastructure/database/models` |
| `src/config/` | Configuración técnica y reglas de mazos | Separar configuración de dominio de configuración de infraestructura |
| `src/utils/` | Utilidades, serializers y validación de mazos | Revisar cada módulo; no migrar automáticamente a `shared` |
| `src/scripts/` | Migraciones, generación y semillas | Mantener como tooling hasta definir una estructura específica |

### Servicios que requieren especial atención

En `src/services/` hay grupos que no deberían permanecer juntos
indefinidamente:

- `services/websocket/`: adaptadores y handlers de WebSocket.
- `services/repositories/`: persistencia.
- `services/game/`: managers y coordinación de juego.
- `services/match/`: casos de uso de partidas.
- `services/coordinators/`: orquestación de aplicación.
- `services/validation/`: separar validación de entrada de reglas de dominio.
- `services/serializers/`: contratos de salida y visibilidad.
- `services/registries/`: estado o infraestructura en memoria.

No mover estos directorios solamente por su nombre. Cada módulo debe
clasificarse según sus dependencias y consumidores reales.

## Arquitectura objetivo

```text
src/
├── app/
│   ├── auth/
│   ├── decks/
│   ├── collection/
│   ├── matches/
│   ├── packs/
│   └── profile/
│
├── domain/
│   └── game/
│       ├── entities/
│       ├── rules/
│       ├── engines/
│       ├── actions/
│       ├── conditions/
│       └── events/
│
├── infrastructure/
│   ├── database/
│   │   ├── models/
│   │   ├── repositories/
│   │   └── sequelize.ts
│   ├── websocket/
│   │   ├── server.ts
│   │   ├── handlers/
│   │   └── middleware/
│   └── mail/
│
├── interfaces/
│   ├── http/
│   │   ├── routes/
│   │   ├── controllers/
│   │   └── middleware/
│   └── websocket/
│       └── handlers/
│
├── shared/
│   ├── errors/
│   ├── types/
│   ├── serializers/
│   └── utils/
│
└── server.ts
```

### Dirección de dependencias

```text
interfaces → app → domain
infrastructure → app/domain contracts
server → interfaces + infrastructure composition
shared → únicamente contratos y utilidades transversales
```

Reglas:

- `domain` no importa Express, WebSockets, Sequelize, PostgreSQL, Redis ni
  variables de entorno.
- `app` coordina casos de uso y puede depender de contratos, no de detalles
  concretos de transporte.
- `interfaces` adapta HTTP y WebSocket a casos de uso.
- `infrastructure` implementa persistencia, servidores y servicios externos.
- El engine de juego debe ser determinista, testeable y sin I/O.
- No crear una nueva carpeta `services` como solución genérica.

## Mapa de migración

| Módulo actual | Destino previsto | Estado | Criterio de finalización |
| --- | --- | --- | --- |
| `src/routes/*.routes.ts` | `src/interfaces/http/routes/` | `[ ]` | Las rutas no contienen lógica de negocio |
| `src/controllers/*.controller.ts` | `src/interfaces/http/controllers/` | `[ ]` | Los controllers no acceden directamente a Sequelize |
| `src/models/*.ts` | `src/infrastructure/database/models/` | `[ ]` | Los modelos no son importados por el dominio |
| `src/services/repositories/` | `src/infrastructure/database/repositories/` | `[ ]` | La persistencia está detrás de repositorios |
| `src/services/websocket/` | `src/infrastructure/websocket/` e `interfaces/websocket/` | `[ ]` | Servidor, middleware y handlers tienen responsabilidades separadas |
| `src/engine/` | `src/domain/game/` | `[ ]` | El engine no tiene dependencias de infraestructura |
| `src/game/` | `src/domain/game/` o eliminación | `[ ]` | No existen dos sistemas paralelos para las mismas reglas |
| `src/services/match/` | `src/app/matches/` | `[ ]` | Los casos de uso de partida tienen límites claros |
| `src/services/coordinators/` | `src/app/matches/` o `src/app/` | `[ ]` | La coordinación pertenece a casos de uso explícitos |
| `src/services/game/` | `src/app/matches/` y `src/domain/game/` | `[ ]` | Managers y reglas están separados |
| `src/utils/deckValidator.ts` | `src/app/decks/` o `src/domain/` | `[ ]` | La validación se clasifica como caso de uso o regla pura |
| `src/services/serializers/` | `src/shared/serializers/` o interfaz | `[ ]` | Cada serializer tiene un límite de salida definido |
| `src/services/registries/` | `src/infrastructure/` | `[ ]` | El estado en memoria tiene ciclo de vida explícito |
| `src/app.ts` | `src/interfaces/http/` | `[ ]` | La composición de Express queda separada del dominio |
| `src/server.ts` | `src/server.ts` | `[ ]` | Solo compone infraestructura y arranca el proceso |

## Fases de trabajo

### Fase 0 — Recuperar contexto y establecer una línea base

- `[ ]` Confirmar scripts de desarrollo, build y test.
- `[ ]` Ejecutar `npm run build` y registrar errores existentes.
- `[ ]` Ejecutar `npm test` y registrar el estado actual.
- `[ ]` Identificar variables de entorno necesarias sin guardar secretos.
- `[ ]` Identificar endpoints HTTP y eventos WebSocket públicos.
- `[ ]` Confirmar qué tablas y scripts de base de datos son necesarios para
  levantar el proyecto.
- `[ ]` Crear una lista de módulos obsoletos, duplicados o sin consumidores.

### Fase 1 — Definir fronteras sin mover comportamiento

- `[ ]` Separar conceptualmente transporte, aplicación, dominio e
  infraestructura.
- `[ ]` Documentar dependencias directas entre controllers, services, models y
  engine.
- `[ ]` Definir contratos de repositorio para las operaciones críticas.
- `[ ]` Definir el estado de batalla y sus entradas/salidas.
- `[ ]` Decidir cuál de `src/engine/` y `src/game/` será la fuente única de
  reglas.

### Fase 2 — Aislar el dominio del juego

- `[ ]` Identificar entidades y value objects de una partida.
- `[ ]` Separar reglas puras de validaciones que requieren base de datos.
- `[ ]` Garantizar que los engines no importen Sequelize ni WebSockets.
- `[ ]` Consolidar acciones, condiciones, habilidades y eventos.
- `[ ]` Añadir pruebas unitarias para daño, turnos, defensa, evasión y efectos.

### Fase 3 — Separar persistencia

- `[ ]` Agrupar modelos Sequelize bajo `infrastructure/database/models`.
- `[ ]` Extraer repositories para partidas, cartas, mazos y colección.
- `[ ]` Encapsular transacciones y locks de base de datos.
- `[ ]` Evitar que el dominio reciba modelos Sequelize.
- `[ ]` Definir cómo se persiste y recupera una partida activa.

### Fase 4 — Separar casos de uso

- `[ ]` Crear módulos de aplicación para auth, decks, collection, matches,
  packs y profile.
- `[ ]` Mover la lógica de coordinación desde controllers y handlers.
- `[ ]` Reutilizar casos de uso desde HTTP y WebSocket cuando representen la
  misma operación.
- `[ ]` Retirar o marcar claramente APIs REST obsoletas.

### Fase 5 — Separar interfaces HTTP y WebSocket

- `[ ]` Mover routes y controllers a `interfaces/http`.
- `[ ]` Separar el servidor WebSocket de sus handlers.
- `[ ]` Separar autenticación, presencia, chat y eventos de partida.
- `[ ]` Mantener compatibilidad de los contratos públicos durante la
  migración.
- `[ ]` Probar autenticación, reconexión, recuperación y errores de eventos.

### Fase 6 — Eliminar duplicación y legado

- `[ ]` Eliminar servicios obsoletos sin consumidores.
- `[ ]` Eliminar reglas duplicadas entre `src/engine/` y `src/game/`.
- `[ ]` Consolidar serializers, validadores y tipos repetidos.
- `[ ]` Actualizar documentación, imports y scripts.
- `[ ]` Revisar que no queden referencias a rutas antiguas.

### Fase 7 — Validación final

- `[ ]` `npm run build` sin errores.
- `[ ]` `npm test` sin regresiones.
- `[ ]` Validar endpoints HTTP principales.
- `[ ]` Validar eventos WebSocket principales.
- `[ ]` Validar migraciones, seeds y generación de cartas.
- `[ ]` Revisar límites de seguridad y exposición de datos.
- `[ ]` Actualizar este documento con el estado real.

## Criterios para considerar una migración completa

Una pieza se considera migrada únicamente cuando:

- tiene una ubicación coherente con su responsabilidad;
- no depende accidentalmente de una capa externa;
- sus consumidores fueron actualizados;
- conserva el comportamiento público esperado;
- tiene validación automatizada o manual documentada;
- no dejó una implementación duplicada activa;
- la estructura y las decisiones están documentadas aquí.

## Decisiones pendientes

- `[!]` ¿La persistencia del estado activo usará memoria local o Redis?
- `[!]` ¿Cuál será la fuente única entre `src/engine/` y `src/game/`?
- `[!]` ¿Los serializers pertenecen a `shared` o a cada interfaz?
- `[!]` ¿Se conservará alguna ruta REST para acciones de partida?
- `[!]` ¿Qué estrategia de migraciones de Sequelize se adoptará?

## Registro de cambios del refactor

| Fecha | Área | Cambio | Validación | Responsable |
| --- | --- | --- | --- | --- |
| 2026-10-13 | Documentación | Creación del roadmap y mapa inicial | Revisión de estructura actual | Equipo |

---

# Revisión de riesgos de Server-SS

Hallazgos de fiabilidad, seguridad y mantenimiento, ordenados por impacto, a
partir de una revisión estática de autenticación, administración, economía,
matchmaking y flujo de juego por WebSocket.

**Fuente:** código local revisado el 12 de octubre de 2026.  
**Alcance:** no es un test de penetración en vivo.  
**Estado:** estos hallazgos deben validarse contra el código actual antes de
marcarlos como corregidos.

## Prioridad inmediata

Atacar primero:

1. Cerrar el endpoint público que otorga cartas.
2. No arrancar con secretos admin/JWT por defecto.
3. Corregir el rollback de las transacciones de sobres.

Estos tres problemas podrían vaciar la economía, permitir la toma de la cuenta
administrativa o congelar el proceso con pocas conexiones filtradas.

### Resumen de prioridad

| Prioridad | Cantidad | Criterio |
| --- | ---: | --- |
| P0 | 4 | Explotable o puede detener el proceso; resolver esta semana |
| P1 | 6 | Equidad, carreras y controles de autenticación incompletos |
| P2 | 5 | Mantenimiento, deriva y controles parciales; backlog |
| Tests automáticos relacionados | 5 archivos | Revisar cobertura existente y ampliarla |

## Hallazgos ordenados

| # | Prioridad | Área | Hallazgo | Arreglo principal |
| ---: | --- | --- | --- | --- |
| 1 | P0 | Seguridad | Un usuario autenticado puede darse cualquier carta | Quitar el endpoint de la API pública, dejarlo solo para admin y auditar las filas de `UserCard`. |
| 2 | P0 | Seguridad | Admin y JWT tienen secretos por defecto en el código | No arrancar sin `JWT_SECRET` y `ADMIN_PASSWORD`; usar un secreto único para JWT, CORS con lista blanca y nunca enviar tokens en la URL. |
| 3 | P0 | Fiabilidad | Comprar o abrir sobres puede dejar transacciones de base de datos abiertas | Hacer rollback en cada salida temprana o abrir la transacción después de validar; ajustar el pool después de cerrar el leak. |
| 4 | P0 | Seguridad | Logout y sesiones no revocan el acceso de verdad | Guardar un ID de sesión en el JWT, comprobarlo en HTTP y WebSocket, y usar `user.id` de forma consistente. |
| 5 | P1 | Seguridad | El estado HTTP de la partida siempre usa la perspectiva del jugador 1 | Pasar el número de jugador llamador a `applyHandVisibility` en HTTP y WebSocket. |
| 6 | P1 | Fiabilidad | El matchmaking HTTP legado tiene condiciones de carrera | Desactivar `find/join` por HTTP y usar una cola WebSocket con `SELECT FOR UPDATE` sobre la fila en espera. |
| 7 | P1 | Fiabilidad | El gasto de monedas no es atómico con el libro mayor | Bloquear la fila del usuario con `FOR UPDATE` y escribir saldo y ledger en la misma transacción. |
| 8 | P1 | Fiabilidad | La idempotencia se consulta fuera del lock y traga errores | Buscar `action_id` dentro de la transacción con lock y fallar cerrado si el registro da error. |
| 9 | P1 | Fiabilidad | El RNG de combate no usa el motor con semilla | Pasar `SeededRNG` desde el estado de la partida a cada decisión aleatoria y persistir la semilla de los sobres. |
| 10 | P1 | Seguridad | No hay rate limit de auth y la verificación de email no se usa | Limitar auth y economía, montar la verificación donde corresponda y usar respuestas genéricas al reenviar. |
| 11 | P2 | Mantenimiento | La caché de definiciones de carta nunca se invalida | Clavear la caché por `updated_at` o vaciarla al escribir desde admin. |
| 12 | P2 | Mantenimiento | Las migraciones defensivas usan un objeto `columns` indefinido | Usar `deckColumns`, fallar el arranque si la migración falla y sustituir `sequelize.sync` por migraciones SQL versionadas. |
| 13 | P2 | Fiabilidad | El flag `foil` se tira dos veces al abrir un sobre | Devolver el `is_foil` persistido. |
| 14 | P2 | Seguridad | Chat y bloqueo de admin están incompletos | Limitar y aplicar rate limit al chat; persistir usuarios bloqueados y rechazarlos en `authenticateSocket`. |
| 15 | P2 | Mantenimiento | La arquitectura está a medias y hay poca cobertura automática | Borrar escrituras HTTP de matchmaking, bloquear selecciones como `CardManager` y añadir tests de F1–F8 antes de más trabajo de motor. |

## Trabajo recomendado, en orden

- `[ ]` Borrar o restringir a admin `POST /api/user-cards` y auditar filas de `UserCard`.
- `[ ]` Fallar cerrado si faltan `JWT_SECRET` o `ADMIN_PASSWORD`.
- `[ ]` Usar un secreto JWT único y CORS con lista blanca.
- `[ ]` Hacer rollback de transacciones de sobres en cada salida temprana.
- `[ ]` Mantener lock de usuario y ledger dentro de la misma transacción.
- `[ ]` Corregir los chequeos de sesión usando `user.id` y aplicarlos en HTTP y WebSocket.
- `[ ]` Pasar la perspectiva del llamador al estado HTTP de la partida.
- `[ ]` Quitar escrituras del matchmaking HTTP y bloquear partidas en espera.
- `[ ]` Mover la búsqueda de `ProcessedActions` dentro del lock y fallar cerrado.
- `[ ]` Cablear `SeededRNG` en `AbilityEngine` y en la apertura de sobres.

## Detalle por severidad

### P0 — Explotable o puede detener el proceso

#### F1. Un usuario autenticado puede darse cualquier carta

`POST /api/user-cards` escribe `quantity` y `foil` sin control de admin. Esto
rompe la colección, los mazos y la economía de sobres.

Archivos involucrados:

- [`src/routes/userCards.routes.ts`](../src/routes/userCards.routes.ts)
- [`src/controllers/userCards.controller.ts`](../src/controllers/userCards.controller.ts)

Acción: quitar el endpoint de la API pública, restringirlo a admin y auditar las
filas existentes de `UserCard`.

#### F2. Admin y JWT tienen secretos por defecto en el código

`ADMIN_PASSWORD` cae a `admin123`. `JWT_SECRET` usa varias cadenas conocidas
entre HTTP, WebSocket y admin. CORS está abierto y el token de admin viaja en
la query del WebSocket.

Archivos involucrados:

- [`src/routes/admin.routes.ts`](../src/routes/admin.routes.ts)
- [`src/middleware/auth.middleware.ts`](../src/middleware/auth.middleware.ts)
- [`src/services/websocket/websocket-auth.service.ts`](../src/services/websocket/websocket-auth.service.ts)
- [`src/app.ts`](../src/app.ts)

Acción: no arrancar sin `JWT_SECRET` y `ADMIN_PASSWORD`, usar un secreto único,
configurar una lista blanca de CORS y no poner tokens en la URL.

#### F3. Comprar o abrir sobres deja transacciones de base de datos abiertas

`buyPack` y `openPack` abren una transacción Sequelize y responden `400` o
`404` sin rollback. Con un pool máximo de 5, unos pocos errores de validación
pueden congelar la API.

Archivos involucrados:

- [`src/controllers/packs.controller.ts`](../src/controllers/packs.controller.ts)
- [`src/config/database.ts`](../src/config/database.ts)

Acción: hacer rollback en cada salida temprana o abrir la transacción después
de validar. Ajustar el pool únicamente después de cerrar el leak.

#### F4. Logout y sesiones no revocan el acceso de verdad

`authenticateToken` pone el modelo `User` en la request usando `id`, mientras
`validateSession` busca `user.userId`. Logout tiene el mismo desajuste.
Además, `validateSession` solo está aplicado en logout y profile, por lo que
packs, mazos, partidas y WebSocket ignoran las filas de sesión.

Archivos involucrados:

- [`src/middleware/auth.middleware.ts`](../src/middleware/auth.middleware.ts)
- [`src/middleware/validateSession.ts`](../src/middleware/validateSession.ts)
- [`src/controllers/auth.controller.ts`](../src/controllers/auth.controller.ts)

Acción: guardar un ID de sesión en el JWT, comprobarlo en cada request HTTP y
conexión WebSocket, y usar `user.id` de forma consistente.

### P1 — Equidad, carreras y autenticación incompleta

#### F5. El estado HTTP de la partida siempre usa la perspectiva del jugador 1

`GameStateBuilder` deja `perspectivePlayer` en 1. `getMatchStateForUser` no
pasa el llamador, por lo que el jugador 2 podría leer la mano del jugador 1
mediante `GET /api/matches/:id`.

Archivos involucrados:

- [`src/services/match/matchState.service.ts`](../src/services/match/matchState.service.ts)
- [`src/services/game/GameStateBuilder.ts`](../src/services/game/GameStateBuilder.ts)

Acción: pasar el número de jugador a `applyHandVisibility` tanto en HTTP como
en WebSocket.

#### F6. El matchmaking HTTP legado tiene condiciones de carrera

`POST /api/matches/find` sigue activo. Une partidas en espera sin lock de fila y
crea filas con `player2_id = player1`. Dos clientes pueden reclamar el mismo
hueco de cola.

Archivos involucrados:

- [`src/controllers/matches.controller.ts`](../src/controllers/matches.controller.ts)
- [`src/routes/matches.routes.ts`](../src/routes/matches.routes.ts)

Acción: desactivar find/join por HTTP y usar una única cola WebSocket con
`SELECT FOR UPDATE` sobre la fila en espera.

#### F7. El gasto de monedas no es atómico con el libro mayor

El saldo se actualiza dentro de una transacción, pero
`logCurrencyTransaction` lee y escribe otra fila de `User` sin lock ni
transacción compartida. Esto puede producir dobles compras y ledgers huérfanos.

Archivos involucrados:

- [`src/controllers/packs.controller.ts`](../src/controllers/packs.controller.ts)
- [`src/services/transactionService.ts`](../src/services/transactionService.ts)

Acción: bloquear la fila del usuario con `FOR UPDATE` y escribir saldo y ledger
en la misma transacción.

#### F8. La idempotencia se consulta fuera del lock y traga errores

`ProcessedActionsRegistry.find` corre antes del lock de fila. Si la base de
datos falla, devuelve `null`, por lo que un reintento puede aplicar dos veces la
acción hasta que la restricción `UNIQUE` rechace la segunda.

Archivos involucrados:

- [`src/services/registries/ProcessedActionsRegistry.ts`](../src/services/registries/ProcessedActionsRegistry.ts)
- [`src/services/game/cardManager.ts`](../src/services/game/cardManager.ts)

Acción: buscar `action_id` dentro de la transacción con lock y fallar cerrado si
el registro da error.

#### F9. El RNG de combate no usa el motor con semilla

Existe `SeededRNG`, pero `AbilityEngine` pasa `Math.random` a `ActionRegistry`.
Los sobres también usan `Math.random`. Combate y aperturas no son
reproducibles, y un cliente puede reintentar un roll mejor si la acción falla
después.

Archivos involucrados:

- [`src/engine/abilities/AbilityEngine.ts`](../src/engine/abilities/AbilityEngine.ts)
- [`src/engine/combat/RNG.ts`](../src/engine/combat/RNG.ts)
- [`src/controllers/packs.controller.ts`](../src/controllers/packs.controller.ts)

Acción: pasar `SeededRNG` desde el estado de la partida a cada decisión
aleatoria y persistir la semilla de los sobres.

#### F10. No hay rate limit de auth y la verificación de email no se usa

Login, registro, reenvío de verificación, compra de sobres y eventos WebSocket
no tienen límite. `requireEmailVerification` existe, pero no está montado. El
reenvío puede revelar si un email está registrado.

Archivos involucrados:

- [`src/app.ts`](../src/app.ts)
- [`src/routes/auth.routes.ts`](../src/routes/auth.routes.ts)
- [`src/middleware/emailVerification.middleware.ts`](../src/middleware/emailVerification.middleware.ts)

Acción: limitar rutas de auth y economía, montar la verificación donde importe
y devolver una respuesta genérica al reenviar.

### P2 — Deriva y controles incompletos

#### F11. La caché de definiciones de carta nunca se invalida

Acción: usar `updated_at` como parte de la clave de caché o vaciarla después de
una escritura administrativa.

#### F12. Las migraciones defensivas usan un objeto `columns` indefinido

Acción: usar `deckColumns`, fallar el arranque si la migración falla y
sustituir `sequelize.sync` por migraciones SQL versionadas.

#### F13. El flag `foil` se tira dos veces al abrir un sobre

Acción: devolver el valor `is_foil` persistido, sin volver a generar el
resultado durante la serialización.

#### F14. Chat y bloqueo de admin están incompletos

Acción: limitar y aplicar rate limit al chat, persistir usuarios bloqueados y
rechazarlos en `authenticateSocket`.

#### F15. La arquitectura está a medias y hay poca cobertura automática

Acción: eliminar escrituras HTTP de matchmaking, bloquear selecciones como
`CardManager` y añadir tests de F1–F8 antes de continuar con el motor.

## Controles que ya estaban bien en la revisión

- Los managers de partida usan locks pesimistas.
- Existe una clave única para `ProcessedActions`.
- La visibilidad de mano se aplica en el broadcast WebSocket.
- Las contraseñas usan bcrypt con 12 rondas.
- Helmet está activo.
- El manejador HTTP 500 no vuelca stacks al cliente.

## Conclusión de la revisión

El trabajo de mayor impacto pendiente es cerrar autenticación y economía, no
continuar primero con la arquitectura del motor. Los documentos de refactor ya
describen locking e idempotencia, pero varias reglas solo están aplicadas
parcialmente. Las correcciones de seguridad y fiabilidad deben tener prioridad
sobre los movimientos estructurales de carpetas.
