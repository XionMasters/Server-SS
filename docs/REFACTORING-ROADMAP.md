# Roadmap de refactorización

## Propósito

Este documento es el plan operativo para refactorizar el proyecto de forma
incremental hacia la arquitectura definida en
[`../.github/copilot-instructions.md`](../.github/copilot-instructions.md).

Documentos relacionados:

- [`ARCHITECTURE-REFACTOR.md`](./ARCHITECTURE-REFACTOR.md): análisis técnico y
  decisiones detalladas del refactor del juego.
- [`SECURITY-REVIEW.md`](./SECURITY-REVIEW.md): hallazgos de seguridad y
  fiabilidad con su estado. **Los hallazgos P0/P1 abiertos tienen prioridad
  sobre los movimientos de carpetas.**

Este archivo sirve para:

- registrar el estado real de la migración;
- definir a qué ubicación pertenece cada responsabilidad;
- evitar movimientos masivos sin entender las dependencias;
- documentar bloqueos, decisiones y validaciones.

**Última verificación contra el código:** 2026-10-26.

## Cómo usar este documento

Estados permitidos:

- `[ ]` Pendiente
- `[-]` En progreso
- `[x]` Completado y validado
- `[!]` Bloqueado o requiere decisión

El trabajo se organiza en **módulos verticales**: cada módulo se migra
completo (interfaz, casos de uso, persistencia, tests) antes de pasar al
siguiente. Para cada módulo:

1. localizar importadores y consumidores;
2. añadir o confirmar tests que fijen el comportamiento público actual;
3. clasificar cada pieza: HTTP, WebSocket, aplicación, dominio o
   infraestructura;
4. mover o adaptar el código;
5. dejar reexports temporales solo si hay consumidores externos, y
   registrarlos en [Reexports temporales](#reexports-temporales);
6. actualizar imports, tests y documentación;
7. ejecutar `npm run build` y las suites relevantes;
8. marcar la tarea solo después de validar el comportamiento.

Un módulo no se cierra con tests en rojo. Si un test falla por una expectativa
previa, se decide explícitamente si se corrige el test o el comportamiento y se
registra en [Decisiones](#decisiones).

## Arquitectura objetivo

Estructura actual (2026-10-26). Ya no quedan carpetas legadas.

```text
src/
├── app/                      # Casos de uso por módulo
│   ├── admin/                # Incluye card-admin.validation.ts
│   ├── auth/
│   ├── cards/
│   ├── chat/
│   ├── collection/
│   ├── decks/                # Incluye deckGenerator y deckValidator (usan BD)
│   ├── matches/
│   │   ├── actions/          # Managers transaccionales (turno, carta, ataque…) y ActionResolver
│   │   ├── coordinators/     # MatchesCoordinator (entrada) y MatchCoordinator
│   │   ├── lifecycle/        # Búsqueda, inicio, estado, abandono, primer turno, setup
│   │   ├── mappers/          # BD ↔ GameState
│   │   ├── serializers/      # Serialización y visibilidad de mano
│   │   └── validation/
│   ├── packs/
│   ├── profile/
│   └── users/
│
├── domain/
│   └── game/                 # Motor puro, determinista, sin I/O (antes src/engine)
│       ├── *RulesEngine.ts, GameState.ts, StatusEffects.ts, ZoneMapper.ts…
│       ├── abilities/  actions/  attack/  combat/  conditions/
│       ├── events/     targets/  technique/
│       └── rules/            # Reglas base de partida (antes src/game/rules)
│
├── infrastructure/
│   ├── ai-art/               # Generación de arte con IA (scripts)
│   ├── assets/               # Lectura de imágenes y generadores de cartas
│   ├── auth/                 # Firma JWT y sesiones
│   ├── cache/
│   ├── database/
│   │   ├── models/           # Todos los modelos Sequelize
│   │   ├── repositories/     # Incluye MatchRepository y ProcessedActionsRegistry
│   │   └── services/         # Ledger transaccional
│   ├── mail/
│   └── websocket/            # Servidor, presencia, router, rate limit, middleware
│
├── interfaces/
│   ├── http/                 # routes, controllers, middleware
│   └── websocket/handlers/
│
├── config/  migrations/sql/  scripts/  views/
├── app.ts                    # Composición de Express
└── server.ts
```

Diferencias con el objetivo original: no se crea `shared/` porque no hay nada
transversal que lo justifique todavía, y el motor queda plano en
`domain/game/` en vez de repartido en `engines/` y `entities/` para no mover
de nuevo 30 archivos sin beneficio. `src/app.ts` sigue en la raíz.

Cambios respecto a la versión anterior del objetivo:

- Se añaden `app/users`, `infrastructure/assets`, `infrastructure/auth` e
  `infrastructure/database/services`, que ya existen y tienen responsabilidad
  clara.
- Los handlers WebSocket tienen **una sola** ubicación:
  `interfaces/websocket/handlers`. Los actuales en
  `infrastructure/websocket/handlers/` deben moverse allí.
- `src/app.ts` pasará a `interfaces/http/app.ts` para no confundirse con
  `src/app/`.
- La ubicación de los serializers queda pendiente de decisión.

### Dirección de dependencias

```text
interfaces → app → domain
infrastructure → app/domain (implementa sus contratos)
server → interfaces + infrastructure (composición)
shared → solo contratos y utilidades transversales
```

Reglas:

- `domain` no importa Express, `ws`, Sequelize, PostgreSQL, Redis ni
  `process.env`.
- `app` coordina casos de uso y depende de contratos, no de transporte.
- `interfaces` adapta HTTP y WebSocket a casos de uso.
- `infrastructure` implementa persistencia, servidores y servicios externos.
- El engine de juego es determinista (RNG con semilla inyectada) y sin I/O.
- No se crea una nueva carpeta `services` como solución genérica.
- Estas reglas se verifican en cada `npm test` con
  `tests/architecture/layer-boundaries.test.ts`. Excepción permitida: la
  composición del WebSocket (`infrastructure/websocket/server.ts` y su
  middleware de auth) importa handlers de `interfaces`.

## Estado actual por capa

Verificado el 2026-10-24.

| Ubicación | Contenido actual | Estado |
| --- | --- | --- |
| `src/interfaces/http/` | 11 routes, 10 controllers, 5 middleware, `cors-options.ts` | `[x]` Incluye `matches` (2026-10-26) |
| `src/interfaces/websocket/handlers/` | `admin`, `chat`, `match`, `presence` | `[x]` Handlers de WS movidos (2026-10-26) |
| `src/app/` | `admin`, `auth`, `cards`, `chat`, `collection`, `decks`, `matches`, `packs`, `profile`, `users` | `[x]` `matches` completo (2026-10-26) |
| `src/domain/game/` | Motor puro (antes `src/engine` y `src/game/rules`) | `[x]` Sin I/O, verificado por test (2026-10-26) |
| `src/infrastructure/cache/` | `card-definition.cache.ts` | Nuevo (2026-10-25) |
| `src/infrastructure/websocket/` | `server.ts` (solo conexión, auth, heartbeat y enrutado), `presence.service.ts`, `websocket-router.ts`, middleware | `[x]` |
| `src/infrastructure/database/models/` | Todos los modelos Sequelize y `associations.ts` | `[x]` `src/models/` eliminada (2026-10-26) |
| `src/infrastructure/database/repositories/` | Repositorios Sequelize, `MatchRepository`, `ProcessedActionsRegistry` | `[x]` `services/repositories` y `services/registries` eliminadas (2026-10-26) |
| `src/models/` | — | `[x]` Eliminada (2026-10-26) |
| `src/routes/` | — | `[x]` Eliminada (2026-10-26) |
| `src/controllers/` | — | `[x]` Eliminada (2026-10-26) |
| `src/middleware/` | — | `[x]` Eliminada (2026-10-25) |
| `src/services/websocket/` | — | `[x]` Eliminada (2026-10-25) |
| `src/services/` | — | `[x]` Eliminada (2026-10-26): ver tabla de destinos abajo |
| `src/engine/` | — | `[x]` Eliminada: ahora `domain/game/` |
| `src/game/` | — | `[x]` Eliminada: `rules/` → `domain/game/rules/`; `abilities/` era código muerto |
| `src/utils/` | — | `[x]` Eliminada (2026-10-26) |
| `src/config/` | `database.ts`, `deck-rules.config.ts`, `starter-deck.config.ts` | Se mantiene; ver Decisiones |
| `src/migrations/sql/` | 8 migraciones SQL numeradas | Estrategia de migraciones en uso |

Destinos de las carpetas legadas eliminadas el 2026-10-26:

| Antes | Ahora |
| --- | --- |
| `services/coordinators/` | `app/matches/coordinators/` |
| `services/match/`, `services/matchSetup.service.ts` | `app/matches/lifecycle/` |
| `services/game/` | `app/matches/actions/` |
| `services/validation/`, `mappers/`, `serializers/` | `app/matches/validation/`, `mappers/`, `serializers/` |
| `services/emailService.ts` | `infrastructure/mail/` |
| `services/aiArtService.ts` | `infrastructure/ai-art/` |
| `services/game.service.ts`, `gameLogic.service.ts`, barrels `index.ts` | Eliminados (sin consumidores) |
| `engine/` | `domain/game/` |
| `game/rules/` | `domain/game/rules/` |
| `game/abilities/` | Eliminado: `AbilityRegistry` no tenía consumidores; las habilidades son datos que interpreta `domain/game/abilities/AbilityEngine` |
| `utils/ZoneMapper.ts` | `domain/game/ZoneMapper.ts` (límites de zona = regla de juego) |
| `utils/deckGenerator.ts`, `deckValidator.ts` | `app/decks/` (usan BD) |
| `utils/cardImageGenerator*.ts` | `infrastructure/assets/` (usan `canvas` y `fs`) |
| `utils/cardSerializer.ts` | Eliminado (sin consumidores) |
| `src/scripts/` | ~50 scripts: seeds, generación y migraciones ad hoc | Tooling; ver Fase 0 |

## Módulos

Orden de trabajo: del menor al mayor riesgo. `matches` va al final porque
concentra WebSocket, motor, locks e idempotencia.

| # | Módulo | Estado | Pendiente |
| ---: | --- | --- | --- |
| 1 | chat | `[x]` | — |
| 2 | auth y sesiones | `[x]` | — (repositorio de `User`: ver Decisiones) |
| 3 | decks | `[x]` | — |
| 4 | packs y economía | `[x]` | — |
| 5 | profile y users | `[x]` | — (repositorios: ver Decisiones) |
| 6 | collection / user-cards | `[x]` | Repetir la auditoría F1 en producción |
| 7 | cards | `[-]` | Test de integración del repositorio contra BD |
| 8 | admin | `[-]` | Prueba manual del panel |
| 9 | matches y WebSocket de partida | `[x]` | — |

Los modelos se movieron todos a la vez a `infrastructure/database/models/`
(2026-10-26) porque `associations.ts` los enlaza entre sí; por eso las tareas
"migrar modelos" de cada módulo están cerradas.

### 1. chat — `[x]`

- `[x]` Routes y controller en `interfaces/http`, contrato `/api/chat` intacto.
- `[x]` Casos de uso de consulta, eliminación y envío en `app/chat`.
- `[x]` Repositorio Sequelize y modelo `ChatMessage` en infraestructura.
- `[x]` Handler WebSocket reutiliza el caso de uso de envío.
- `[x]` Handler en `interfaces/websocket/handlers/chat.handler.ts`.
- `[x]` Rate limit (5 mensajes / 10 s por usuario) y máximo de 500 caracteres
  (F14); tests en `tests/chat/`.
- `[x]` El chat por WebSocket solo exige sesión, igual que `/api/chat`. (Se
  llegó a exigir email verificado por error y bloqueaba en silencio el chat de
  usuarios sin verificar; revertido el 2026-10-27.)

### 2. auth y sesiones — `[-]`

- `[x]` Controller, routes y middleware HTTP en `interfaces/http`.
- `[x]` Firma y verificación JWT centralizadas en `infrastructure/auth`.
- `[x]` Sin secretos por defecto; validación de configuración al arrancar.
- `[x]` `sessionId` en el JWT, validado en HTTP y WebSocket.
- `[x]` Sin tokens en parámetros de URL del WebSocket.
- `[x]` `UserSession` en `infrastructure/database/models`.
- `[x]` Casos de uso de registro, login, logout, perfil y email en `app/auth`.
- `[x]` Rate limiting en auth y economía.
- `[x]` Verificación de email montada en packs, transacciones, mazos y
  partidas.
- `[x]` Tests de sesión revocada, logout, JWT sin `sessionId`, CORS y auth
  WebSocket.
- `[x]` Registro atómico: usuario, mazo inicial y monedas en una transacción;
  comprobación de duplicados sin comodines de `iLike`.
- `[x]` `DB_PASSWORD` obligatoria al arrancar; eliminada una contraseña real
  escrita en un script de depuración (**rotar la contraseña de PostgreSQL**).
- `[x]` Acceso a `User` vía repositorio: descartado por ahora (ver
  [Decisiones](#decisiones)).
- `[x]` Reenvío de verificación siempre genérico (F10): un fallo de envío ya
  no devuelve 500 solo para cuentas existentes.
- `[x]` Login sin comodines de `iLike` y rechazo de usuarios bloqueados
  (después de comprobar la contraseña, para no revelar el bloqueo).

### 3. decks — `[x]`

- `[x]` Routes y controller en `interfaces/http`, endpoints sin cambios.
- `[x]` `deck.rules`, `DeckQueryService`, `DeckBattleService` y fachada de
  casos de uso en `app/decks`.
- `[x]` Corregida la regresión de `syncDeckCards`: `assertDeckSizeLimit`
  exigía el mínimo de 40 cartas al editar (sync, añadir carta, cambiar
  cantidad), lo que impedía construir un mazo desde cero. Ahora solo limita el
  máximo; el mínimo se valida en `DeckBattleService.getAndValidateActiveDeck`.
- `[x]` Test importa desde `app/decks`; retirado `src/services/deck.service.ts`.
- `[x]` `deckValidator` y `deckGenerator` consultan la BD → `app/decks/`.
- `[x]` Migrar `Deck`, `DeckCard`, `DeckBack` a `infrastructure/database/models`.

### 4. packs y economía — `[x]`

- `[x]` Routes y controller en `interfaces/http`.
- `[x]` Transacciones administradas con locks y ledger transaccional.
- `[x]` Ledger en `infrastructure/database/services/transaction.service.ts`.
- `[x]` Apertura de sobres con `SeededRNG`; semilla y estado de avance en el ledger (F9).
- `[x]` Reutilizar el mismo `is_foil` en colección, ledger y respuesta (F13).
- `[x]` Tests y scripts apuntan a rutas nuevas; retirados
  `src/controllers/packs.controller.ts` y `src/services/transactionService.ts`.
  Esto arregló `packs-image-regressions`, que no arrancaba porque mockeaba el
  reexport en lugar del módulo real.
- `[x]` Migrar `Pack`, `UserPack`, `UserTransaction`, `UserCardTransaction`.
- `[x]` El ledger de apertura registra `pack.id` también cuando se abre por
  `user_pack_id`.

### 5. profile y users — `[x]`

- `[x]` `app/profile` y lectura de imágenes en `infrastructure/assets`.
- `[x]` `GET /api/users/me` con route, controller y caso de uso, sin exponer
  credenciales.
- `[x]` Migrar `User`, `UserProfile`, `ProfileAvatar`, `UserAvatarUnlock`,
  `UserDeckBackUnlock`.
- `[x]` Extraer repositorios: descartado por ahora (ver [Decisiones](#decisiones)).

### 6. collection / user-cards — `[x]`

- `[x]` `POST /api/user-cards` no expuesto (`tests/security/user-cards.routes.test.ts`).
- `[x]` Auditoría de filas de `UserCard` (F1): `npm run audit:user-cards`
  (solo lectura) compara cada fila con el ledger `user_card_transactions`.
  BD local (2026-10-26): 54 filas, 0 sospechosas. **Ejecutarla también en
  producción antes de cerrar F1 allí.**
- `[x]` Test apunta a la ruta nueva; retirado `src/routes/userCards.routes.ts`.
- `[x]` Migrar `UserCard`.

### 7. cards — `[-]`

- `[x]` `GET /api/cards`, `/api/cards/:id` y `/api/cards/stats/summary`
  separados en route, controller, casos de uso (`app/cards`) y repositorio
  (`SequelizeCardCatalogRepository`). Contrato público sin cambios.
- `[x]` Traducción con fallback (pedido → EN → ES) extraída a la función pura
  `app/cards/card-translation.ts`; antes estaba duplicada.
- `[x]` Parámetros numéricos inválidos (`limit=abc`, `cost_min=x`) se ignoran
  o usan el valor por defecto en lugar de llegar como `NaN` a la consulta.
- `[x]` Invalidación de la caché de definiciones (F11):
  `infrastructure/cache/card-definition.cache.ts`, usada por `cardManager` y
  `knightManager` e invalidada por admin al crear, editar o borrar cartas.
- `[x]` Tests en `tests/cards/card-catalog.test.ts`.
- `[x]` Tope máximo de 1000 para `limit` (`CARD_LIST_MAX_LIMIT`). El catálogo
  tiene 93 cartas, así que el cliente puede seguir pidiéndolo entero.
- `[x]` `total` devuelve el tamaño de la página, no el total de la tabla. Se
  conserva así (ver [Decisiones](#decisiones)).
- `[ ]` Test de integración del repositorio contra BD (los filtros Sequelize
  no tienen cobertura automática).
- `[x]` Migrar `Card`, `CardKnight`, `CardAbility`, `CardTranslation`.
- `[x]` `utils/cardSerializer.ts` eliminado (sin consumidores); generadores de
  imagen → `infrastructure/assets/`.

### 8. admin — `[-]`

- `[x]` `routes/admin.routes.ts` dividido en `interfaces/http/routes/admin.routes.ts`
  (API, `/api/admin`) y `admin-panel.routes.ts` (HTML/JS/CSS, `/admin`);
  controller en `admin.controller.ts`, `requireAdmin` en `admin.middleware.ts`.
- `[x]` Lógica en `app/admin/`: `admin-auth.use-case.ts`, `match-inspection.ts`
  (funciones puras) y `card-admin.ts` (casos de uso con errores tipados en vez
  de comparar mensajes). Persistencia en `SequelizeAdminMatchRepository` y
  `SequelizeCardAdminRepository`.
- `[x]` Eliminado el doble montaje: `/admin` solo sirve el panel y
  `/api/admin` solo la API (el panel ya usaba solo `/api/admin`).
- `[x]` `POST /api/admin/auth` con rate limit propio (5 intentos / 15 min) y
  comparación de contraseña en tiempo constante.
- `[x]` Los 500 ya no devuelven `err.message` interno al cliente.
- `[x]` El panel carga también desde el build: las vistas se resuelven desde
  la raíz del proyecto (antes buscaba `dist/views`, que no existe).
- `[x]` WebSocket del panel reparado (no conectaba desde el endurecimiento de
  auth): el token viaja como subprotocolo (`admin, <jwt>`) en lugar de la URL,
  y usa `wss:` bajo HTTPS.
- `[x]` Los eventos admin (`get_admin_stats`, `admin_disconnect_user`,
  `admin_block_user`) llegan al router; antes el socket admin no tenía
  listener y los botones no hacían nada.
- `[x]` Eliminado el broadcast con `Map` vacío que mostraba 0 usuarios.
- `[x]` Handler movido a `interfaces/websocket/handlers/admin.handler.ts`.
- `[x]` Tests en `tests/admin/admin.test.ts` y casos de subprotocolo en
  `tests/auth/websocket-auth.middleware.test.ts`.
- `[x]` Bloqueo de usuarios persistido (F14): columna `users.blocked_at`
  (migración `008`; en desarrollo se añade sola al arrancar). Bloquear revoca
  las sesiones y cierra todos los sockets del usuario; login, HTTP y WebSocket
  lo rechazan (`USER_BLOCKED`). Nuevo evento `admin_unblock_user` y lista
  "Bloqueados" en el panel. Tests en `tests/admin/admin-block-user.test.ts`.
- `[x]` XSS en el panel: los nombres de usuario y de cartas se insertaban en
  `innerHTML` sin escapar (un jugador podía ejecutar código en el navegador del
  admin y robar su token). `escHtml` ahora escapa también comillas y se aplica
  a todo texto que viene de jugadores o de la BD.
- `[x]` Validar el cuerpo de `POST/PUT /api/admin/cards`:
  `app/admin/card-admin.validation.ts` (lista blanca de campos, tipos, enums,
  longitudes; campos obligatorios al crear). Errores 400 con
  `details.errores`. Tests en `tests/admin/card-admin-validation.test.ts`.
- `[ ]` Probar el panel manualmente: login, dashboard en vivo, inspector,
  CRUD de cartas.

### 9. matches y WebSocket de partida — `[x]`

Correcciones de comportamiento (2026-10-26), con tests:

- `[x]` `resolve_selection` ya no envía la mano del rival: usa los mismos
  `match_update` por jugador que el resto de acciones.
- `[x]` Emparejamiento atómico (`SELECT … FOR UPDATE SKIP LOCKED` al reclamar
  la partida en espera, con reintento); la partida se borra si falla el
  reparto de cartas.
- `[x]` PvP valida los mazos, usa `BASE_MATCH_RULES` (mano de 5, vida,
  cosmos) y sortea el jugador inicial; `START_FIRST_TURN` respeta el sorteo.
- `[x]` Conexión WS: listeners registrados antes de autenticar (sin mensajes
  perdidos ni usuarios fantasma); errores de desconexión capturados.
- `[x]` `use_ability` reenvía `target_id`; los eventos de partida por WS exigen
  email verificado.
- `[x]` Abandono con lock y aviso a ambos jugadores (`match_finished`).
- `[x]` Reintentos idempotentes en partidas TEST y selección del jugador 2 en
  TEST.

Requisitos previos:

- `[x]` Tests de caracterización inicial de eventos WebSocket de partida
  (búsqueda, inicio, fin de turno, ataque, abandono y reconexión); ver
  `tests/matches/websocket-match-contract.test.ts` y
  `tests/matches/match-recovery-contract.test.ts`.
- `[x]` Decisión `engine` vs `game/abilities`: gana `engine` (ver
  [Decisiones](#decisiones)).

Tareas:

- `[x]` Handlers de partida en `interfaces/websocket/handlers/match.handler.ts`;
  `server.ts` solo compone.
- `[x]` Desactivar escrituras de matchmaking HTTP (`find`/`cancel-search`) (F6); los
  endpoints heredados responden `410 Gone`.
- `[x]` `services/match/*` → `app/matches/lifecycle/`.
- `[x]` `services/coordinators/*` → `app/matches/coordinators/`.
- `[x]` `services/game/*` → `app/matches/actions/` (son managers
  transaccionales; las reglas puras ya estaban en el motor).
- `[x]` `services/validation/*` → `app/matches/validation/`.
- `[x]` `services/repositories/MatchRepository.ts` →
  `infrastructure/database/repositories/`.
- `[x]` `services/registries/ProcessedActionsRegistry.ts` →
  `infrastructure/database/repositories/`, con búsqueda dentro del lock (F8).
- `[x]` `services/serializers/`, `services/mappers/` →
  `app/matches/serializers/` y `app/matches/mappers/`.
- `[x]` Retirados `services/game.service.ts` y `gameLogic.service.ts` (sin
  consumidores); `matchSetup.service.ts` → `app/matches/lifecycle/`.
- `[x]` `routes/matches.routes.ts` y `controllers/matches.controller.ts` en
  `interfaces/http`.
- `[x]` `src/engine/` y `src/game/rules/` → `src/domain/game/`. Sacados del
  motor el único `process.env` y la dependencia de `utils/ZoneMapper`.
- `[x]` Migrar `Match`, `MatchAction`, `CardInPlay`, `ProcessedAction`.
- `[x]` Persistencia de la partida activa: la BD es la fuente de verdad (ver
  [Decisiones](#decisiones)).

## Reexports temporales

Archivos antiguos que solo reexportan la nueva ubicación. Se eliminan cuando no
quedan consumidores. Ojo: un `jest.mock` sobre el reexport no intercepta a los
módulos que importan la ruta real.

| Reexport | Destino real | Consumidores pendientes | Módulo |
| --- | --- | --- | --- |
| — | — | — | — |

Retirados el 2026-10-25: `src/routes/userCards.routes.ts`,
`src/controllers/packs.controller.ts`, `src/services/transactionService.ts`,
`src/services/deck.service.ts`.

## Fases transversales

### Fase 0 — Línea base

- `[x]` `npm run build` ejecutado; error F12 corregido el 2026-10-14. Desde el
  2026-10-26 el arranque en desarrollo falla si una migración defensiva falla.
- `[x]` Jest instalado (`node_modules/jest` presente).
- `[x]` Línea base de `npm test` (2026-10-25): 13/13 suites, 46/46 tests.
- `[x]` `ts-jest` 29.4 declara compatibilidad con `jest` 30; su config pasó de
  `globals` a `transform` (sin aviso de deprecación).
- `[x]` `strict: true` en `tsconfig.json` (4 errores corregidos; añadido
  `@types/pg`). Mucho código sigue usando `any`.
- `[x]` Corregido `generate:cards` en `package.json` (`generateAllCards.ts`).
- `[x]` Eliminado `@types/socket.io` (el proyecto usa `ws`); declarado `uuid`.
- `[x]` Documentar variables de entorno principales en `.env.example`.
- `[!]` `.env.pollinations` **está versionado** (comprobado en el índice de
  git). Solo contiene `USE_POLLINATIONS=true`, sin secretos. Falta ejecutar
  `git rm --cached .env.pollinations`.
- `[x]` Scripts sueltos de la raíz movidos a `scripts/debug/` con imports
  ajustados. `test-deck-generation.ts` requiere `node-fetch`, que no está
  instalado. `server-output.txt` sigue en la raíz.
- `[x]` Eliminadas carpetas vacías `src/middleware/` y `src/services/websocket/`.
- `[x]` Verificación automática de fronteras entre capas: test de Jest
  `tests/architecture/layer-boundaries.test.ts` (sin dependencias nuevas; corre
  con `npm test`). También impide que reaparezcan carpetas legadas.
- `[x]` Inventario de endpoints HTTP y eventos WebSocket públicos:
  [`API-INVENTORY.md`](./API-INVENTORY.md).
- `[x]` Rate limit de eventos WebSocket (F10): 30 eventos / 5 s por socket; tras
  3 ventanas excedidas se cierra la conexión. Mensajes limitados a 64 KB
  (`ws` aceptaba 100 MB por defecto).

### Fase 1 — Dominio del juego

Se ejecuta dentro del módulo `matches`, pero puede avanzar en paralelo porque
el dominio no tiene dependencias externas.

- `[x]` `domain/game/` no importa Sequelize, `ws`, Express ni `process.env`
  (verificado por test desde 2026-10-26).
- `[x]` Inyectar `SeededRNG` en combate, habilidades, selección y barajado de
  mazos al iniciar partidas; semilla persistida en `matches.rng_seed` y
  migración SQL `007` (F9).
- `[ ]` Definir el estado de batalla y sus entradas/salidas.
- `[x]` Consolidar abilities: solo queda `domain/game/abilities/`.
- `[ ]` Tests unitarios de daño, turnos, defensa, evasión y efectos.

### Fase 2 — Validación final

- `[x]` `npm run build` sin errores (2026-10-26).
- `[x]` `npm test` sin regresiones: 32 suites, 184 tests (2026-10-26).
- `[x]` Sin carpetas legadas (`src/routes`, `src/controllers`, `src/services`,
  `src/models`, `src/engine`, `src/game`, `src/utils`), verificado por test.
- `[x]` Sin reexports temporales.
- `[ ]` Validar endpoints HTTP y eventos WebSocket principales contra un
  servidor real y el cliente Godot (solo hay tests unitarios y de contrato).
- `[-]` Validar migraciones, seeds y generación de cartas: migración 007
  aplicada y verificada en PostgreSQL local (56 partidas); `008` se aplica
  sola en desarrollo; faltan las demás y producción.
- `[-]` Hallazgos de [`SECURITY-REVIEW.md`](./SECURITY-REVIEW.md): todos
  cerrados en código; quedan acciones de despliegue (ver ese documento).

## Criterios para considerar una migración completa

Una pieza se considera migrada únicamente cuando:

- tiene una ubicación coherente con su responsabilidad;
- no depende accidentalmente de una capa externa;
- sus consumidores fueron actualizados (incluidos tests y scripts);
- conserva el comportamiento público esperado;
- tiene validación automatizada o manual documentada, sin tests en rojo;
- no dejó una implementación duplicada activa ni un reexport sin registrar;
- la estructura y las decisiones están documentadas aquí.

## Decisiones

| Tema | Estado | Notas |
| --- | --- | --- |
| `engine` vs `game` | `[x]` | Gana `engine` → `domain/game/`. `game/rules/` se movió a `domain/game/rules/`. `game/abilities/` (`AbilityRegistry` + 3 habilidades en código) no tenía consumidores: las habilidades son datos (`card_abilities`) que interpreta `AbilityEngine`, así que se eliminó. Solo se conservó el tipo `ResolvedAbility`, ahora en `ActionResolver`. |
| Estrategia de migraciones | `[-]` | SQL numeradas en `src/migrations/sql/`, aplicadas a mano en producción; en desarrollo `database.ts` añade las columnas que falten y ahora falla el arranque si no puede. Pendiente a futuro: un ejecutor de migraciones con tabla de control, que permitiría retirar `sequelize.sync`. |
| Test de `syncDeckCards` | `[x]` | Se corrigió el comportamiento: el mínimo de cartas solo se exige para jugar, no al editar. |
| Ubicación de serializers | `[x]` | `app/matches/serializers/`. Los usan tanto HTTP como WebSocket (y la visibilidad de mano es una regla de la aplicación, no del transporte), así que no van en una sola interfaz. No se crea `shared/` para un único consumidor. |
| Estado activo de partida | `[x]` | La BD es la fuente de verdad: cada acción bloquea la fila del match, aplica el motor y persiste en la misma transacción, y la reconexión reconstruye el estado desde la BD. Sin Redis mientras haya un solo proceso. Si se escala a varios procesos, hará falta Redis (pub/sub) para la presencia, el envío de eventos entre procesos y la invalidación de la caché de cartas (F11), no para el estado de partida. |
| REST de acciones de partida | `[x]` | Solo lecturas (`GET /api/matches/:id`, reanudar TEST) más abandonar y crear TEST. Las acciones de juego van solo por WebSocket. |
| `total` del catálogo de cartas | `[x]` | `total` sigue siendo el tamaño de página por compatibilidad, y desde el 2026-10-27 se añade `total_count` con el total real. Corrección: la decisión inicial asumía que nadie dependía de `total`, pero `CardDatabase.gd` del cliente paginaba con él y dejaba de cargar tras la primera página (las cartas 101–128 no existían en el juego). El cliente usa ahora `total_count`. |
| Repositorios para `User` y perfiles | `[x]` | Descartado por ahora. Los casos de uso usan los modelos Sequelize directamente; extraer interfaces de repositorio solo aporta si se quieren tests sin BD de esos módulos o cambiar de ORM. Se revisará si aparece esa necesidad. |
| Rate limit en memoria | `[x]` | Chat y eventos WS se limitan en memoria del proceso. Suficiente con un solo proceso; con varios, cada uno limita por su cuenta. |
| Doble montaje de admin | `[x]` | `/admin` sirve el panel; `/api/admin`, la API. |

## Registro de cambios del refactor

| Fecha | Área | Cambio | Validación |
| --- | --- | --- | --- |
| 2026-10-13 | Documentación | Creación del roadmap y mapa inicial | Revisión de estructura actual |
| 2026-10-14 | Base de datos | Corregida referencia `columns` → `deckColumns` en migración defensiva | Pendiente de ejecutar build |
| 2026-10-15 | Chat HTTP | Routes y controller trasladados a `interfaces/http` sin cambiar el contrato público | `npm run build` correcto |
| 2026-10-15 | Chat vertical slice | Casos de uso, repositorio Sequelize, modelo y handler WebSocket migrados; se preservó la respuesta HTTP existente | `npm run build` correcto |
| 2026-10-15 | Infraestructura WebSocket | Servidor, presencia, autenticación, router y panel admin trasladados fuera de `services` | `npm run build` correcto |
| 2026-10-15 | Auth y sesiones | Casos de uso extraídos; JWT, sesiones HTTP/WS, admin, CORS, rate limiting y política de email endurecidos | `npm run build` y 5 suites de auth correctas |
| 2026-10-15 | Colección y economía | Confirmada la ausencia de mutaciones públicas de colección; packs usa transacciones atómicas con locks y ledger transaccional | `npm run build` y 2 suites focalizadas correctas |
| 2026-10-15 | Estado de partida | La perspectiva del estado HTTP/WebSocket se deriva del usuario autenticado y oculta la mano rival | `npm run build` y prueba de perspectiva correctas |
| 2026-10-15 | Decks HTTP | Routes, controller y `DeckService` trasladados a `interfaces/http` y `app/decks` sin cambiar endpoints | `npm run build` correcto; 4/5 regresiones de decks correctas |
| 2026-10-15 | Profile HTTP | Controller reducido a adaptación HTTP; lógica trasladada a `app/profile` y lectura de imágenes a infraestructura | `npm run build` correcto; 12 suites pasan, 1 falla por regresión previa de decks |
| 2026-10-15 | Decks HTTP | Controller reducido con manejo común de errores y fachada de casos de uso; se conserva `DeckService` para consumidores del motor | `npm run build` correcto; 4/5 regresiones de decks pasan, 1 falla por expectativa previa de `syncDeckCards` |
| 2026-10-15 | Deck application services | Reglas puras, consultas y preparación de partidas extraídas a `deck.rules`, `DeckQueryService` y `DeckBattleService`; `DeckService` mantiene compatibilidad | `npm run build` correcto; 4/5 regresiones de decks pasan, 1 falla por expectativa previa de `syncDeckCards` |
| 2026-10-16 | Packs HTTP | Routes y controller trasladados a `interfaces/http`; límites de economía, autenticación, verificación de email y transacciones permanecen sin cambios | `npm run build` y 2 regresiones de packs correctas |
| 2026-10-16 | Transaction ledger | Servicio Sequelize trasladado a `infrastructure/database/services`; se mantiene reexport temporal en `src/services` | `npm run build` y prueba de ledger correctos |
| 2026-10-16 | Users HTTP | `GET /api/users/me` separado en route, controller y caso de uso, preservando la exclusión de credenciales | `npm run build` correcto |
| 2026-10-24 | Documentación | Roadmap reorganizado por módulos verticales con estado verificado contra el código; revisión de riesgos separada en `SECURITY-REVIEW.md`; añadida tabla de reexports temporales y decisiones parcialmente resueltas | Revisión estática del repositorio |
| 2026-10-25 | Reexports y Fase 0 | Retirados 4 reexports temporales (tests y scripts apuntan a rutas reales); eliminadas carpetas vacías; corregido script `generate:cards`; `.env.pollinations` ignorado | `npm run build` correcto; 13/13 suites (antes 11/13) |
| 2026-10-25 | Decks | `assertDeckSizeLimit` deja de exigir el mínimo al editar mazos; el mínimo se mantiene al preparar la partida | `deck-system-regressions` 5/5 |
| 2026-10-25 | Cards | Catálogo público migrado a `interfaces/http` + `app/cards` + repositorio Sequelize; traducción deduplicada; caché de definiciones invalidable por admin (F11) | `npm run build` correcto; 14/14 suites, 57/57 tests |
| 2026-10-25 | Admin | Router dividido en panel/API con capa `app/admin` y repositorios; rate limit y comparación constante en login admin; WebSocket del panel reparado (token por subprotocolo, eventos admin enrutados, sin broadcast vacío); vistas cargan desde el build | `npm run build` correcto; 15/15 suites, 69/69 tests; panel sin probar manualmente |
| 2026-10-26 | Matches y RNG | Matchmaking HTTP de escritura desactivado (410); idempotencia reconsultada bajo lock y fail-closed; RNG seeded persistido por partida y en ledger de sobres | Build y suites focalizadas |
| 2026-10-26 | Revisión de código | Corregidos: fuga de mano en `resolve_selection`, carrera de emparejamiento, reglas PvP, carreras de conexión WS, `target_id` de habilidades, email verificado en WS, abandono con lock y aviso, idempotencia TEST, registro atómico, rate limit del chat; eliminado código muerto | `tsc` correcto; 27 suites, 162 tests |
| 2026-10-26 | Seguridad y Fase 0 | Contraseña de BD retirada del código; `DB_PASSWORD` obligatoria; `strict: true`; scripts de raíz a `scripts/debug/`; `@types/socket.io` fuera; config `ts-jest` actualizada | `tsc` correcto; tests en verde |
| 2026-10-26 | Admin, auth y cards | Validación del CRUD de cartas; F10 cerrado; tope de `limit` en catálogo | 29 suites, 172 tests |
| 2026-10-26 | Persistencia | Todos los modelos a `infrastructure/database/models/`; `MatchRepository` y `ProcessedActionsRegistry` a `infrastructure/database/repositories/`; imports reescritos en `src`, `tests` y `scripts` | `tsc` correcto; 29 suites, 172 tests |
| 2026-10-26 | Matches y dominio | `services/` → `app/matches/{coordinators,lifecycle,actions,validation,mappers,serializers}` e `infrastructure/{mail,ai-art}`; `engine/` y `game/rules/` → `domain/game/`; `utils/` repartido; eliminado código muerto (`game/abilities`, `game.service`, `gameLogic.service`, `cardSerializer`, barrels). Test de fronteras entre capas | `tsc` correcto; 30 suites, 176 tests |
| 2026-10-27 | Catálogo y colección | `GET /api/cards` devuelve `total_count`; el cliente solo cargaba 100 de 128 cartas. La pantalla de Colección mostraba el catálogo entero como si fuera del jugador: ahora usa `/api/user-cards`. En el cliente, `CardData` no traducía los tipos reales de la BD (`tecnica`, `ayudante`, `ocasion`) y las técnicas, ayudantes y ocasiones no encajaban en ninguna zona del tablero | 35 suites, 207 tests; cliente: 128 cartas, 27 propias, tipos coinciden con la BD |
| 2026-10-27 | Tipos de carta | Las 128 cartas de la BD guardan el tipo en español (`'caballero'`, `'tecnica'`…) pero el servidor comparaba con valores en inglés: el motor no aplicaba los efectos pasivos de entrada de los caballeros, el validador avisaba de "0 caballeros" y el generador automático de mazos no encontraba caballeros. Nuevo `domain/game/CardTypes.ts` (`normalizeCardType`) aplicado al leer de la BD en motor, selecciones, validador y generador. No se migran los datos porque partes del cliente comparan con los valores en español | 35 suites, 207 tests; validación real: 25 caballeros, sin avisos |
| 2026-10-27 | Perfil | Imágenes de avatar (daban 404 por una ruta mal calculada); estadísticas reales de partidas, historial, colección y dorso del mazo activo en `GET /api/profile`; desbloqueo por cartas legendarias (buscaba `'legendaria'`); perfil público sin escrituras; migración `009` (`card_abilities.ability_key`, sin ella el catálogo con habilidades daba 500) | 34 suites, 193 tests; prueba contra el servidor real |
| 2026-10-26 | Seguridad | Bloqueo persistente de usuarios (F14, migración 008); XSS en el panel admin; rate limit y tamaño máximo de eventos WS (F10); arranque falla si falla una migración (F12); auditoría F1 (`npm run audit:user-cards`); login sin comodines | `tsc` correcto; 32 suites, 184 tests; auditoría F1 en BD local: 0 sospechosas |
