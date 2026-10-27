# Inventario de API pública

Endpoints HTTP y eventos WebSocket que expone el servidor, verificados contra el
código el 2026-10-26. Sirve para saber qué contrato hay que mantener al
refactorizar y qué validar con el cliente Godot.

Convenciones:

- **Auth**: `token` = `Authorization: Bearer <jwt>` de usuario con sesión
  activa y no bloqueado. `email` = además exige email verificado. `admin` =
  token de admin.
- Los usuarios bloqueados reciben `403` con `code: USER_BLOCKED` en cualquier
  ruta con `token`.

## HTTP

### Salud y estáticos

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/health` | — | Estado del servicio |
| GET | `/assets/*` | — | Imágenes de cartas, avatares, sobres |

### Auth — `/api/auth`

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| POST | `/register` | rate limit | Crea usuario, mazo inicial y 400 monedas en una transacción |
| POST | `/login` | rate limit | Revoca las sesiones anteriores; `403` si el usuario está bloqueado |
| POST | `/logout` | token | |
| GET | `/profile` | token | |
| GET | `/verify-email` | — | `?token=` |
| POST | `/resend-verification` | rate limit | Respuesta siempre genérica |

### Usuarios, perfil y colección

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/api/users/me` | token | Sin credenciales |
| GET | `/api/profile/avatar/:id/image` | — | |
| GET | `/api/profile/user/:userId` | — | Perfil público |
| GET | `/api/profile` | token | Incluye `stats` (victorias, derrotas, rachas; las partidas de prueba aparte), `recent_matches`, `collection` y `active_deck` con su dorso |
| GET | `/api/profile/avatars` | token | |
| PUT | `/api/profile/avatar` | token | |
| GET | `/api/profile/deck-backs` | token | |
| PUT | `/api/profile/deck-back` | token | |
| POST | `/api/profile/check-unlocks` | token | |
| GET | `/api/user-cards` | token | Solo lectura (F1) |
| GET | `/api/user-cards/stats` | token | |

### Cartas — `/api/cards`

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/` | — | `limit` máximo 1000; `total` = tamaño de la página; `total_count` = total real con los filtros (para paginar) |
| GET | `/stats/summary` | — | |
| GET | `/:id` | — | |

### Mazos — `/api/decks` (token + email)

| Método | Ruta |
| --- | --- |
| GET / POST | `/` |
| GET / PUT / DELETE | `/:id` |
| GET / POST | `/:id/cards` |
| PUT / DELETE | `/:id/cards/:card_id` |
| PUT | `/:id/sync-cards` |
| GET | `/:id/validate` |
| GET | `/:id/stats` |
| POST | `/:id/generate` |
| PUT | `/:id/cover-card` |

### Sobres — `/api/packs`

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/available` | — | |
| GET | `/my-packs` | token | |
| POST | `/buy` | email + rate limit | Transaccional |
| POST | `/open` | email + rate limit | Transaccional, RNG con semilla en el ledger |

### Transacciones — `/api/transactions` (token + email)

`GET /currency`, `GET /cards`, `GET /stats`, `GET /recent`.

### Chat — `/api/chat` (token)

`GET /messages`, `GET /private`, `DELETE /messages/:message_id`.

### Partidas — `/api/matches` (token + email)

| Método | Ruta | Notas |
| --- | --- | --- |
| POST | `/init-match-test` | Crea partida TEST |
| GET | `/test/resume` | Reanuda partida TEST |
| POST | `/find`, `/cancel-search` | **410 Gone**: el emparejamiento es solo por WebSocket |
| GET | `/:id` | Estado desde la perspectiva del usuario |
| POST | `/:id/abandon` | Notifica `match_finished` a ambos jugadores por WS |

Las acciones de juego (jugar carta, atacar, terminar turno…) solo existen por
WebSocket.

### Admin

| Método | Ruta | Auth | Notas |
| --- | --- | --- | --- |
| GET | `/admin`, `/admin/admin.js`, `/admin/style.css` | — | Panel (la API exige token) |
| POST | `/api/admin/auth` | rate limit (5 / 15 min) | Devuelve token de admin |
| GET | `/api/admin/matches`, `/api/admin/matches/:id` | admin | Inspector |
| GET / POST | `/api/admin/cards` | admin | Cuerpo validado (lista blanca) |
| GET / PUT / DELETE | `/api/admin/cards/:cardId` | admin | Borrado solo si la carta no está en uso |

## WebSocket — `/ws`

Mensajes JSON `{ "event": "...", "data": { ... } }` en ambos sentidos.

- **Conexión**: `Authorization: Bearer <jwt>` (cliente) o subprotocolo
  `admin, <jwt>` (panel). Si falla la autenticación, el servidor envía
  `error` y cierra con código `1008` y el código de error como motivo
  (`INVALID_TOKEN`, `SESSION_INVALIDATED`, `USER_BLOCKED`…).
- **Límites**: mensajes de hasta 64 KB; 30 eventos cada 5 s por socket. Al
  pasarse se recibe `error` con `RATE_LIMITED`; tras 3 ventanas seguidas se
  cierra con `1008 RATE_LIMITED`.
- **Email**: los eventos de partida exigen email verificado (`error` con
  `EMAIL_NOT_VERIFIED`). El chat no, igual que `/api/chat`.

### Cliente → servidor

| Evento | Datos | Notas |
| --- | --- | --- |
| `ping` | — | Responde `pong` |
| `request_online_users` | — | Responde `online_users` |
| `update_status` | `status`: `online` \| `in_match` \| `away` | |
| `chat_message` | `message`, `message_type` (`global` \| `whisper`), `target_user_id` | Máx. 500 caracteres, 5 mensajes / 10 s |
| `search_match` | — | `searching` o `match_found` |
| `cancel_search` | — | `search_cancelled` |
| `request_test_match` | — | `match_found` o `match_error` |
| `resume_test_match` | — | `match_found` o `match_error` |
| `abandon_test_match` | `match_id` | Abandona y crea otra TEST |
| `request_match_state` | `match_id` | `match_state` |
| `resolve_selection` | `match_id`, `selection_id`, `chosen_card_id`, `action_id` | `match_update` por jugador |
| `play_card` | `match_id`, `action_id`, `card_id`, `zone`, `position` | |
| `declare_attack` | `match_id`, `action_id`, `attacker_id`, `defender_id` | |
| `end_turn` | `match_id`, `action_id` | |
| `start_first_turn` | `match_id`, `action_id` | `turn_changed` |
| `change_defensive_mode` | `match_id`, `action_id`, `knight_id`, `mode` | |
| `use_ability` | `match_id`, `action_id`, `card_id`, `ability_name`, `target_id` | |
| `match_action` | `type` + campos de la acción | Genérico: `END_TURN`, `PLAY_CARD`, `ATTACK`, `TECHNIQUE_ATTACK`, `CHANGE_DEFENSIVE_MODE`, `CHARGE_COSMOS`, `SACRIFICE_KNIGHT`, `MOVE_KNIGHT`, `USE_ABILITY`, `START_FIRST_TURN` |

`action_id` debe ser un UUID generado por el cliente y reutilizado en los
reintentos (idempotencia).

### Servidor → cliente

| Evento | Cuándo |
| --- | --- |
| `connected` | Tras autenticar (`has_active_match`) |
| `match_resumed` | Al conectar con una partida activa |
| `pong` | Respuesta a `ping` |
| `online_users` | Lista de usuarios conectados |
| `chat_message`, `chat_error` | Chat |
| `searching`, `search_cancelled` | Emparejamiento |
| `match_found` | Partida creada (estado desde la perspectiva de cada jugador) |
| `match_update` | Tras cada acción; cada jugador recibe su perspectiva, con la mano rival oculta. Incluye `last_action` y `engine_events` filtrados |
| `match_state` | Respuesta a `request_match_state` |
| `turn_changed` | Tras `start_first_turn` |
| `match_finished` | Abandono (`winner_id`, `reason`, `abandoned_by`) |
| `match_error` | Errores de partidas TEST |
| `admin_disconnect`, `admin_blocked` | Antes de que el admin cierre el socket |
| `error` | `{ code, message }` |

### Panel admin (solo sockets admin)

Cliente → servidor: `get_admin_stats`, `admin_disconnect_user`,
`admin_block_user`, `admin_unblock_user` (con `user_id`), `ping`.

Servidor → cliente: `connected`, `admin_stats` (`connectedUsers`,
`searchingUsers`, `blockedUsers`, `activeMatches`).
