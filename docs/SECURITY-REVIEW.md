# Revisión de riesgos de Server-SS

Hallazgos de fiabilidad, seguridad y mantenimiento, ordenados por impacto, a
partir de una revisión estática de autenticación, administración, economía,
matchmaking y flujo de juego por WebSocket.

**Fuente:** código local revisado el 12 de octubre de 2026.
**Última actualización de estados:** 26 de octubre de 2026.
**Alcance:** no es un test de penetración en vivo.

El plan de refactorización está en [`REFACTORING-ROADMAP.md`](./REFACTORING-ROADMAP.md).
Los hallazgos abiertos de P0/P1 tienen prioridad sobre los movimientos de
carpetas.

Estados: `[ ]` abierto · `[-]` parcialmente resuelto · `[x]` resuelto y validado.

## Resumen

| # | Prioridad | Área | Hallazgo | Estado | Validación |
| ---: | --- | --- | --- | --- | --- |
| F1 | P0 | Seguridad | Un usuario autenticado puede darse cualquier carta | `[-]` | Endpoint no expuesto; auditoría `npm run audit:user-cards`: BD local limpia (54 filas, 0 sospechosas). Falta ejecutarla en producción |
| F2 | P0 | Seguridad | Admin y JWT tienen secretos por defecto | `[x]` | Suites de auth (2026-10-15) |
| F3 | P0 | Fiabilidad | Comprar/abrir sobres deja transacciones abiertas | `[x]` | Suites de packs (2026-10-15/16) |
| F4 | P0 | Seguridad | Logout y sesiones no revocan el acceso | `[x]` | `logout.use-case`, `http-auth.middleware`, `websocket-auth.middleware` |
| F5 | P1 | Seguridad | Estado HTTP de partida usa siempre la perspectiva del jugador 1 | `[x]` | `tests/matches/match-perspective.test.ts` |
| F6 | P1 | Fiabilidad | Matchmaking HTTP legado con condiciones de carrera | `[x]` | `POST /find` y `/cancel-search` responden 410; test de rutas |
| F7 | P1 | Fiabilidad | Gasto de monedas no atómico con el ledger | `[x]` | `tests/economy/transaction.service.test.ts` |
| F8 | P1 | Fiabilidad | Idempotencia consultada fuera del lock y traga errores | `[x]` | Reconsulta dentro del lock; errores fallan cerrado; test de registro |
| F9 | P1 | Fiabilidad | RNG de combate y sobres no usa `SeededRNG` | `[x]` | Semilla de partida persistida; sobres guardan semilla y avance en el ledger |
| F10 | P1 | Seguridad | Sin rate limit de auth y verificación de email sin montar | `[x]` | Rate limit de eventos WS y tamaño máximo (`tests/websocket/rate-limiter.test.ts`); reenvío genérico (`tests/auth/email-verification.use-case.test.ts`); email verificado también en WS (2026-10-26) |
| F11 | P2 | Mantenimiento | Caché de definiciones de carta nunca se invalida | `[x]` | `tests/cards/card-catalog.test.ts` (2026-10-25); solo invalida el proceso local |
| F12 | P2 | Mantenimiento | Migraciones defensivas usan `columns` indefinido | `[x]` | Corregido `deckColumns`; el arranque falla si una migración falla (2026-10-26). Sustituir `sequelize.sync` queda como mejora futura (roadmap, Decisiones) |
| F13 | P2 | Fiabilidad | El flag `foil` se tira dos veces al abrir un sobre | `[x]` | Se genera una vez y se reutiliza para colección, ledger y respuesta |
| F14 | P2 | Seguridad | Chat y bloqueo de admin incompletos | `[x]` | `tests/chat/`, `tests/admin/admin-block-user.test.ts` (2026-10-26); requiere migración 008 en producción |
| F15 | P2 | Mantenimiento | Arquitectura a medias y poca cobertura | `[x]` | Sin carpetas legadas; fronteras verificadas por `tests/architecture/layer-boundaries.test.ts`; 32 suites (2026-10-26) |
| F16 | P1 | Seguridad | Login admin sin rate limit y comparación no constante | `[x]` | `tests/admin/admin.test.ts` (2026-10-25) |
| F17 | P2 | Seguridad | El panel admin enviaba su token en la URL del WebSocket | `[x]` | `tests/auth/websocket-auth.middleware.test.ts` (2026-10-25) |
| F18 | P0 | Seguridad | Contraseña real de PostgreSQL escrita en un script versionado | `[-]` | Retirada del código y `DB_PASSWORD` obligatoria (2026-10-26). **Falta rotar la contraseña**: sigue en el historial de git |
| F19 | P1 | Seguridad | XSS almacenado en el panel admin vía nombre de usuario | `[x]` | `escHtml` con comillas aplicado a todo texto de jugadores/BD (2026-10-26); sin test automático (código de navegador) |
| F20 | P1 | Seguridad | `resolve_selection` enviaba la mano del rival | `[x]` | `tests/matches/match-update-visibility.test.ts`, `websocket-match-contract.test.ts` (2026-10-26) |
| F21 | P2 | Seguridad | Login y registro usaban `iLike` con datos del usuario (`%` y `_` como comodines) | `[x]` | `tests/admin/admin-block-user.test.ts` (login); igualdad con `lower()` (2026-10-26) |

## Pendiente, en orden

Todo está resuelto en código. Quedan acciones de despliegue:

1. `[ ]` F18 — Rotar la contraseña de PostgreSQL y actualizar `.env`.
2. `[ ]` Aplicar en producción las migraciones `007`, `008` y `009` antes de
   desplegar (sin `008`, todas las consultas de usuarios fallan; sin `009`,
   el catálogo con habilidades devuelve 500).
3. `[ ]` F1 — Ejecutar `npm run audit:user-cards` en producción.
4. `[ ]` `git rm --cached .env.pollinations` (sin secretos, pero no debe estar
   versionado).

## Detalle y estado de hallazgos

### F18. Contraseña de PostgreSQL en el código — `[-]`

`investigate-user.ts` (ahora `scripts/debug/`) creaba su propia conexión con la
contraseña real escrita. Ahora usa `src/config/database.ts`, que lee `.env`, y
el servidor no arranca sin `DB_PASSWORD`. La contraseña sigue en el historial de
git, así que hay que rotarla.

### F19. XSS en el panel admin — `[x]`

El panel insertaba `username` (elegido por cualquier jugador) en `innerHTML`, y
`escHtml` no escapaba comillas aunque se usaba dentro de atributos. Un nombre
como `<img src=x onerror=...>` ejecutaba código en el navegador del admin, con
acceso a su token en `sessionStorage`. Corregido en
[`src/views/admin.js`](../src/views/admin.js).

### F1. Un usuario autenticado puede darse cualquier carta — `[-]`

`POST /api/user-cards` escribía `quantity` y `foil` sin control de admin. El
endpoint ya no está expuesto, pero pueden existir filas creadas mientras lo
estuvo.

- [`src/interfaces/http/routes/userCards.routes.ts`](../src/interfaces/http/routes/userCards.routes.ts)
- [`src/interfaces/http/controllers/userCards.controller.ts`](../src/interfaces/http/controllers/userCards.controller.ts)

Auditoría: `npm run audit:user-cards` (solo lectura,
[`scripts/audit-user-cards.ts`](../scripts/audit-user-cards.ts)) compara cada
fila con `SUM(ACQUIRE) - SUM(LOSE)` del ledger y marca cantidades sin respaldo,
foils sin adquisición foil y cartas inexistentes. BD local (2026-10-26): 54
filas, 0 sospechosas. Pendiente: ejecutarla en producción.

### F6. El matchmaking HTTP legado tiene condiciones de carrera — `[x]`

Las rutas `POST /api/matches/find` y `/api/matches/cancel-search` ya no mutan
partidas y responden `410 Gone`, con instrucciones para usar los eventos
WebSocket `search_match` y `cancel_search`. Se retiró el caso de uso HTTP que
actualizaba la cola sin lock.

Validación: `tests/matches/matchmaking-http-disabled.test.ts`.

### F8. La idempotencia se consulta fuera del lock y traga errores — `[x]`

Las acciones verifican el identificador antes de abrir la transacción como
optimización y vuelven a consultarlo después de adquirir el lock de la partida.
La consulta acepta la transacción, valida partida/jugador/tipo y propaga fallos
de base de datos; un fallo ya no se interpreta como “acción nueva”.

- [`src/services/registries/ProcessedActionsRegistry.ts`](../src/services/registries/ProcessedActionsRegistry.ts)
- [`src/services/game/cardManager.ts`](../src/services/game/cardManager.ts)

Validación: `tests/phase8/processed-actions-registry.test.ts` y
`tests/phase8/attack-manager-idempotency.test.ts`.

### F9. El RNG de combate no usa el motor con semilla — `[x]`

La semilla generada en el servidor se persiste en `matches.rng_seed` y avanza
en el mismo lock/transacción que el estado de juego. El RNG compartido se usa
en combate y cadenas de habilidades, selección interactiva y barajado inicial.
Las aperturas de sobres usan una semilla criptográficamente aleatoria y guardan
semilla/estado por carta en `user_card_transactions.metadata`.

- [`src/engine/abilities/AbilityEngine.ts`](../src/engine/abilities/AbilityEngine.ts)
- [`src/engine/actions/ActionRegistry.ts`](../src/engine/actions/ActionRegistry.ts)
- [`src/engine/combat/RNG.ts`](../src/engine/combat/RNG.ts)
- [`src/app/packs/pack.service.ts`](../src/app/packs/pack.service.ts)

La migración SQL `007_add_match_rng_seed.sql` debe aplicarse antes de desplegar
esta versión. Los usos restantes de `Math.random` están en generación offline
de mazos o scripts de simulación, no en resolución de partidas ni sobres.

### F10. Rate limit y verificación de email — `[x]`

Resuelto: rate limit en auth y economía, y `requireEmailVerification` montado
en packs, transacciones, mazos y partidas. Desde el 2026-10-26:

- Eventos WebSocket limitados a 30 / 5 s por socket (cierre tras 3 ventanas
  excedidas) y mensajes de hasta 64 KB
  ([`rate-limiter.ts`](../src/infrastructure/websocket/rate-limiter.ts)).
- Eventos de partida por WebSocket exigen email verificado (igual que
  `/api/matches`). El chat no, igual que `/api/chat`.
- El reenvío de verificación ya no devuelve 500 cuando falla el envío a una
  cuenta existente (eso revelaba qué emails están registrados).

- [`src/interfaces/http/middleware/rate-limit.middleware.ts`](../src/interfaces/http/middleware/rate-limit.middleware.ts)
- [`src/interfaces/http/routes/auth.routes.ts`](../src/interfaces/http/routes/auth.routes.ts)
- [`src/infrastructure/websocket/server.ts`](../src/infrastructure/websocket/server.ts)

### F11. La caché de definiciones de carta nunca se invalida — `[x]`

Resuelto: las cachés de `cardManager` y `knightManager` se registran en
[`src/infrastructure/cache/card-definition.cache.ts`](../src/infrastructure/cache/card-definition.cache.ts)
y admin llama a `invalidateCardDefinition` tras crear, editar o borrar una
carta. Limitación: si el servidor se escala a varios procesos, cada uno
mantiene su caché; habría que invalidar vía Redis/pub-sub o usar `updated_at`.

### F12. Migraciones defensivas — `[x]`

Corregido: referencia `columns` → `deckColumns` en
[`src/config/database.ts`](../src/config/database.ts), y desde el 2026-10-26 el
arranque falla si una migración defensiva falla. Sustituir `sequelize.sync` por
un ejecutor de migraciones queda como mejora (ver roadmap, Decisiones).

### F13. El flag `foil` se tira dos veces al abrir un sobre — `[x]`

El resultado `isFoil` se genera una sola vez y se reutiliza al actualizar la
colección, registrar la transacción y serializar la respuesta.

### F14. Chat y bloqueo de admin — `[x]`

- Chat: máximo 500 caracteres y 5 mensajes cada 10 s por usuario.
- Bloqueo: columna `users.blocked_at` (migración
  [`008`](../src/migrations/sql/008_add_blocked_at_to_users.sql)). Bloquear
  revoca todas las sesiones y cierra todos los sockets; login, HTTP y
  WebSocket rechazan al usuario con `USER_BLOCKED`. El panel muestra la lista
  de bloqueados y permite desbloquear (`admin_unblock_user`).

### F15. Arquitectura a medias y poca cobertura — `[x]`

Migración de carpetas completada (ver
[`REFACTORING-ROADMAP.md`](./REFACTORING-ROADMAP.md)). Las fronteras entre
capas se comprueban en cada `npm test`.

### F16. Login admin sin rate limit — `[x]`

Encontrado el 2026-10-25. `POST /api/admin/auth` aceptaba intentos ilimitados
y comparaba la contraseña con `!==`. Ahora tiene un límite propio (5 intentos
cada 15 min por IP) y compara hashes con `timingSafeEqual`.

### F17. Token admin en la URL del WebSocket — `[x]`

Encontrado el 2026-10-25. El panel conectaba con `/ws?admin_token=...`. El
servidor ya no lo aceptaba, así que el dashboard no conectaba. Ahora el token
viaja como subprotocolo (`Sec-WebSocket-Protocol: admin, <jwt>`).

## Hallazgos resueltos (resumen)

- **F2:** el servidor no arranca sin `JWT_SECRET` y `ADMIN_PASSWORD`; secreto
  JWT único centralizado en `infrastructure/auth/token.service.ts`; CORS con
  lista blanca; sin tokens en la URL del WebSocket.
- **F3:** compra y apertura de sobres usan transacciones administradas sin
  retornos tempranos con la transacción abierta.
- **F4:** `sessionId` en el JWT, validado en cada request HTTP y conexión
  WebSocket; uso consistente de `user.id`.
- **F5:** la perspectiva del estado HTTP/WebSocket se deriva del usuario
  autenticado y oculta la mano rival.
- **F7:** lock de usuario y ledger en la misma transacción.

## Controles que ya estaban bien en la revisión

- Los managers de partida usan locks pesimistas.
- Existe una clave única para `ProcessedActions`.
- La visibilidad de mano se aplica en el broadcast WebSocket.
- Las contraseñas usan bcrypt con 12 rondas.
- Helmet está activo.
- El manejador HTTP 500 no vuelca stacks al cliente.
