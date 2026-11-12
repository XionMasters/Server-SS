# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proyecto

Backend de **Caballeros Cósmicos**, un juego de cartas coleccionables por turnos inspirado en Saint Seiya. Node.js + TypeScript + Express 5 + PostgreSQL (Sequelize) + WebSocket nativo (`ws`, no Socket.IO) para que sea compatible con el cliente Godot, que está en `A:\Desarrollo\ccc` (la URL del servidor se configura en `shared/config/GameConfig.gd`).

Idioma: comentarios, logs y mensajes al cliente en español. Los errores HTTP usan el formato `{ "error": "mensaje" }`. Los valores internos de los enums van en inglés (tipos `knight|technique|item|stage|helper|event`, rarezas `common|rare|epic|legendary|divine`, elementos `steel|fire|water|earth|wind|light|dark`).

## Comandos

```powershell
npm run dev                 # nodemon + ts-node src/server.ts
npm run build               # tsc -> dist/
npm start                   # node dist/server.js
npm test                    # Jest (ts-jest), tests/**/*.test.ts
npx jest tests/phase8/technique-engine.test.ts   # un archivo
npx jest -t "nombre del test"                    # un test por nombre
```

No hay linter configurado; `npm run build` sirve como comprobación de tipos.

Requiere `.env` (ver `.env.example`): `DB_*`, `JWT_SECRET`, `ADMIN_PASSWORD`, `CORS_ORIGIN` y `SMTP_*`. `validateSecurityConfiguration()` hace que el arranque falle si falta la configuración de seguridad.

**Fuente única de cartas: `database/<Saga>/**/*.json`** (Santuario, Poseidon, Omega, BlackSaints); `database/bkp/` son copias antiguas que el cargador y los tests ignoran. No hay otras fuentes: `seed.sql` solo trae packs, avatares y dorsos. Se cargan con `npm run seed:cards` (`scripts/loadFromJson.ts`, upsert por `code`; `seed:cards:dry` valida sin escribir; `--file <json>` para uno solo). `tests/cards/card-data-integrity.test.ts` exige `code` único, rareza válida y habilidades que el motor entienda.

Imágenes de carta: `tools/card-generator/` (Python + Pillow). `generate_art.py` genera el arte con IA en la carpeta que espeja el JSON de la carta en minúsculas (`database/Poseidon/Knight/marines.json` → `art/poseidon/knight/marines/{code}.jpg`, ver `art_dir_for` en `generate.py`; `find_art` también acepta arte suelto en la raíz de `art/`) y usa `art_prompt` de la carta o lo construye; `generate_v2.py --all` compone la carta completa en `src/assets/cards/{code}.webp`. `loadFromJson` usa ese archivo como `image_url` si existe y, si no, el `image_url` del JSON. El cliente muestra `image_url` tal cual (sin marco propio).

Fondos de partida: cuando hay una carta de escenario (`stage`) en juego, el cliente pide `/assets/stage-backgrounds/{code}.webp` (`src/assets/stage-backgrounds/`, panorámica 16:9, ej. 1920×1080) y la pone a pantalla completa; si no existe, mantiene el fondo de cosmos base.

Otros scripts de datos (escriben en la base de datos de `.env`): `generate:packs` (ver "Sobres"), `seed:ta:all`, `migrate:status-sources[:dry]` y `decks:random[:dry]`. Este último (`scripts/giveRandomDecks.ts`, admite `--user` y `--faction`) crea para cada usuario un mazo aleatorio jugable (`app/decks/randomDeckBuilder.ts`), le entrega las copias que le falten (`ADMIN_GIFT`) y lo deja activo.

## Esquema y migraciones

- `database/schema.sql` es el esquema base; `database/seed.sql`, los datos que no son cartas. BD local nueva: crear la BD de `.env`, aplicar `schema.sql` y `seed.sql`, y luego `npm run seed:cards` (el registro de usuarios necesita las cartas del mazo inicial). Una BD creada con un `schema.sql` anterior se pone al día con `011_card_types_ranks_and_techniques.sql`.
- `src/migrations/sql/NNN_*.sql` contiene migraciones SQL numeradas que se aplican a mano.
- Con `NODE_ENV=development`, `src/config/database.ts` ejecuta `sequelize.sync()` y además **migraciones defensivas** que añaden columnas si faltan (`rng_seed`, `pending_selection`, `ability_key`, `code`, `rank`…). Si añades una columna nueva que debe existir en local, crea el SQL numerado y su comprobación en ese archivo.
- Las tablas usan PK UUID y columnas `snake_case`. Las asociaciones están en `src/infrastructure/database/models/associations.ts`.

## Arquitectura por capas

```
src/interfaces      → HTTP (routes/controllers/middleware) y handlers WS
src/app             → casos de uso y orquestación por área (auth, decks, matches, packs, profile…)
src/domain/game     → motor de reglas puro
src/infrastructure  → Sequelize (models/repositories), servidor WS, auth, mail, ai-art
src/config          → BD, reglas de mazo y mazo inicial
```

`tests/architecture/layer-boundaries.test.ts` **hace cumplir** estas fronteras, así que el test falla si no se respetan:
- `domain` no importa otras capas ni `sequelize|pg|ws|express|axios|fs|http…`, y no usa `process.env`.
- `app` no importa `interfaces` ni `express`/`ws`.
- `infrastructure` solo puede importar `interfaces` desde `websocket/server.ts` y `websocket/middleware/auth.middleware.ts` (es la raíz de composición del WS).
- Prohibido recrear las carpetas legadas `src/{services,engine,game,models,routes,controllers,middleware}`.

`.github/copilot-instructions.md` describe la misma arquitectura y las reglas del juego (acciones BA/TA/CC/SAC/EV/MOV/DEF, fórmulas de daño), pero algunas rutas que cita están desactualizadas: `src/models/…` ahora es `src/infrastructure/database/models/…`, `src/utils/deckValidator.ts` ahora es `src/app/decks/deckValidator.ts`, y `docs/REFACTORING-ROADMAP.md` no existe. El código del motor tiene prioridad sobre esa documentación.

## Flujo de una partida

0. **Emparejamiento**: al encontrar rival, la partida queda directamente en `playerN_turn` (no hace falta `start_first_turn`, que solo usa TEST). Se envía `match_found` (tablero inicial, sin `valid_actions`) y a continuación un `match_update` completo.
1. **Conexión WS** en `/ws` (`infrastructure/websocket/server.ts`). Se autentica con JWT, aplica límite de frecuencia por socket, payload máximo de 64 KB y heartbeat cada 30 s. Al conectar se llama a `matchesCoordinator.recoverOnSocketConnect` y, si hay partida activa, se emite `match_resumed`. Al desconectar se borran las partidas del jugador en estado `waiting`.
2. **Enrutado**: los mensajes llegan como `{ event, data }` y `WebSocketRouter` los envía a los handlers de `interfaces/websocket/handlers/`. Los eventos de partida pasan por `withVerifiedEmail` y los de administración por `withAdmin`. El matchmaking por HTTP está deshabilitado (ver `tests/matches/matchmaking-http-disabled.test.ts`): se busca partida por WS.
3. **Coordinación**: `app/matches/coordinators/matchesCoordinator.ts` es un orquestador ligero que delega en `lifecycle/*` (search, start, setup, abandon, state) y en `actions/*Manager` (turn, knight, card, attack, technique, selection).
4. **Motor**: `domain/game` contiene los `*RulesEngine`, `AbilityEngine` (las habilidades son datos JSONB en `card_abilities`, que se interpretan mediante `ActionRegistry`, `ConditionRegistry` y `TargetResolver`), `StatusEffects`, `GameEventBus` y `RNG`. Este último es determinista y usa `matches.rng_seed`. Las mutaciones pasan por una única puerta (`actions/DamageAction`, `KillAction`, `HealAction`, `SummonAction` y `DrawCardAction`).
5. **Persistencia**: el estado de la partida vive en PostgreSQL (`matches` y `cards_in_play`, incluido `pending_selection` para las selecciones de objetivo pendientes) y se reconstruye con `GameStateBuilder` y `MatchStateMapper`. La idempotencia de las acciones se garantiza con `ProcessedActionsRegistry` (tabla `processed_actions`, migración 001).
6. **Respuesta**: `ActionResolver` calcula las `valid_actions` del jugador activo (**el cliente nunca calcula reglas**). Después, `broadcastMatchUpdate` envía un `match_update` distinto a cada jugador: `handVisibility` oculta la mano del rival y los `engine_events` se filtran por jugador (`ALLY_DREW_CARD` / `OPPONENT_DREW_CARD`).

Las acciones originadas por HTTP (por ejemplo, abandonar) notifican por WS mediante `matchesCoordinator.setNotifier`.

**Jugador vs IA** (`app/matches/ai/`, guía completa en `docs/JUGADOR-VS-IA.md`): el evento WS `request_ai_match` crea una partida directa (`StartMatchService.startDirectMatch`) contra un usuario de sistema con id fijo (`aiBot.ts`, `isAiBot`), con un mazo por facción generado por `randomDeckBuilder` (`aiOpponent.service.ts`). El cliente recibe `match_found` + `match_update` igual que en PvP. `aiTurnRunner` se suscribe a `matchesCoordinator.onMatchStateChanged` y, mientras le toque (turno o `pending_selection` suya), ejecuta la jugada que elige `aiDecision.decideAiMove` por la misma puerta que un jugador (`handleAction` / `SelectionService`), solo entre las `valid_actions` de `ActionResolver`; una jugada rechazada no se repite en el turno. La IA cuenta como "conectada" al reconectar, y `match_resumed` de partidas PvP/IA trae `game_state` para entrar directo al tablero. Pausa entre jugadas: `AI_MOVE_DELAY_MS` (1100 por defecto). **Autojuego**: `npm run ai:selfplay -- --games 20 [--faction X] [--ai-faction Y] [--out informe.json]` juega partidas IA contra IA con cartas reales y lista jugadas rechazadas, errores del motor y partidas atascadas (sirve para encontrar cartas rotas).

**Repeticiones** (`app/replays/`, tablas `match_replays`/`match_replay_frames`, migración 014): cada `match_update` que difunde `MatchesCoordinator._buildMatchUpdateResult` **con una acción** se guarda como fotograma (estado sin perspectiva, sin cartas del mazo ni `valid_actions`, JSON comprimido con gzip). También se graban el inicio (`startFirstTurn` en TEST; en PvP el `match_start`) y el abandono. Al terminar la partida se conservan solo las repeticiones que están entre las últimas 5 de alguno de sus jugadores. `GET /api/matches/:id/replay` (solo participantes, respuesta gzip) devuelve los fotogramas con la visibilidad de quien la pide (`frameForViewer`); `recent_matches` del perfil trae `has_replay`. En el cliente, `MatchSessionService.start_replay` abre GameMatch en modo repetición y `game/match/ReplayControls.gd` aplica los fotogramas como `match_update` normales.

## Reglas de partida

- **Primer turno**: quien empieza (`matches.first_player`, migración 013) no puede atacar al jugador rival en su turno 1 (BA ni TA directos; atacar caballeros sí). `domain/game/rules/opening-turn.rules.ts`, aplicado en `AttackRulesEngine`/`TechniqueRulesEngine` y en `ActionResolver`. `current_turn` solo sube cuando vuelve a jugar el jugador 1, por eso hace falta `first_player`.
- **Cosmo del jugador**: entre 0 y `BASE_MATCH_RULES.max_cosmos` (12). Todo lo que lo modifica pasa por `domain/game/rules/cosmos.rules.ts` (`addPlayerCosmos`/`clampPlayerCosmos`); con el cosmo lleno no se ofrece ni se acepta Cargar Cosmo.
- **Acción del caballero**: BA, TA, Cargar Cosmo, Evasión, Defensa y Mover gastan la única acción del turno del caballero (`domain/game/rules/knight-action.rules.ts`). `CHARGE_COSMOS` exige `knight_id` y da +1 CP; `MOVE_KNIGHT` solo a una casilla adyacente.
- **Un caballero por turno**: solo se juega un caballero desde la mano por turno (`BASE_MATCH_RULES.turn.knights_per_turn`, `domain/game/rules/knight-play.rules.ts`, validado en `CardRulesEngine.validatePlayCard` y en `ActionResolver`). Una habilidad da más con la acción `grant_extra_knight_play` (`amount`, 1 por defecto). Las invocaciones por habilidad no cuentan. Los contadores se guardan en `matches.turn_counters` (JSONB, migración 015) y se ponen a cero al cambiar de turno, así que los permisos extra caducan.
- **Pasivas fuera del campo** (mazo/yomotsu, `passive_watchers`): solo reaccionan si la habilidad lo declara con `event_target_is_self` o `self_in_zone` de una zona que no es del campo (`PassiveTriggerEngine`).

## Habilidades de cartas (reglas no obvias)

- Las habilidades son JSON en `card_abilities.effects` (`{ trigger, cost?, conditions?, actions[] }`), interpretados por `AbilityEngine`/`ActionRegistry`/`ConditionRegistry`/`TargetResolver`. `tests/cards/card-data-integrity.test.ts` valida que los JSON de `database/` solo usen nombres que el motor conoce: si añades una acción, condición, objetivo o estado, regístralo también en el catálogo de `src/views/admin.html`.
- `remaining_turns` se descuenta al **inicio del turno del dueño** de la carta. Para que `frozen`/`paralyzed` sobre un rival dure "su próximo turno" hace falta `duration: 2` (`IMMOBILIZE_DEFAULT_TURNS`).
- `CARD_PLAYED` solo dispara habilidades de la carta jugada. `TURN_END` y `KNIGHT_DIED` disparan para ambos jugadores (usar `event_player_is_self` si es "turno propio"). Las pasivas de caballero con `BA_DEALT`/`BA_RECEIVED`/`TA_*`/`DAMAGE_DEALT` necesitan `event_source_is_self` o reaccionan a cualquier carta.
- Todo daño pasa por `applyDamage` (aplica `last_stand`); las inmunidades a estados, por `isStatusBlocked`.
- `ActionResolver` envía `ability_key` como `ability_name`; `knightManager.useAbility` acepta la clave o el nombre normalizado.
- `max_copies` limita las copias en el mazo; `unique` limita el **campo**: un jugador no puede tener dos caballeros del mismo `character` (ej: `kanon` para Kanon v1 y v2) si alguno es único (`domain/game/rules/unique.rules.ts`, aplicado al jugar desde la mano y en `summonKnight`). Todo caballero único debe declarar `character` (lo exige el test de integridad).
- La Provocación (estado `taunt`) obliga a los BA rivales a ir contra el portador mientras no esté inmovilizado; las TA no están obligadas. `armor_unbreakable` anula el `ignore_armor` de los BA contra el portador (las TA con `ignore_ar` siguen ignorando la AR).
- Los bonos de escenario se aplican con `duration: 1` al entrar y en cada `TURN_START` del dueño (el descuento de efectos ocurre antes, así que cubren el turno rival). Un caballero que entra después no los recibe hasta el siguiente turno, salvo que tenga su propia pasiva de entrada con `stage_has_card_code` (ej: Baian con el Pilar del Pacífico Norte).
- Una selección puede encadenar otra: `request_slot_selection` en el `on_select` pide una posición (zona `field_slot`, el cliente responde `chosen_slot`) y `move_to_slot` mueve/intercambia.
- Cada habilidad activa se usa **una vez por turno y caballero** (marker `ability_used`, que `KnightRulesEngine` añade y `ActionResolver` respeta). Toda `pending_selection` debe llevar `visible_card_ids` (o `visible_slots`): el cliente solo muestra esas opciones.
- Los objetos se juegan **equipándolos a un caballero propio** (`domain/game/rules/equipment.rules.ts`): `valid_actions.equip_targets` lista los caballeros que cumplen el filtro de la selección de campo propio del objeto, el cliente envía el elegido como `equip_target_id` en `PLAY_CARD` y `CardRulesEngine.resolveEquipTarget` lo valida y elige la posición de la fila de técnicas (la columna del caballero o la primera libre; la `position` del cliente no cuenta). Esa selección del efecto de entrada se resuelve sola con el caballero equipado, y al salir del campo sus objetos van al yomotsu (`releaseEquipment`).
- Cada tipo de carta tiene su zona (`PLAY_ZONE_BY_TYPE` en `domain/game/CardTypes.ts`): el escenario va a `field_scenario` (`state.scenario`, con `player_number` del dueño) y `valid_actions.play_zone` le dice al cliente a dónde va cada carta de la mano.

## Sobres

- Rarezas (6): `common, uncommon, rare, epic, legendary, divine` (migración 016 añadió `uncommon`).
- Los sobres se definen en `src/config/packs.config.ts` y `npm run generate:packs[:dry]` los sincroniza por `code`: retira los que no estén, devolviendo su precio a quien los tenga sin abrir (`PACK_REFUND`). El contenido de cada sobre son las cartas de sus `collections` (`cards.collection_id`, que es la saga del JSON). Si `coming_soon` está activo, el sobre se ve en la tienda pero no se puede comprar.
- Motor puro en `src/domain/packs/`: 5 cartas por sobre y una rareza sorteada por carta (`PackConfig.rarityProbabilities`, calibradas por sobre con 1 − (1 − p)^(1/5)). **Garantía**: `user_pack_pity` cuenta, por jugador y sobre, los sobres seguidos sin épica o superior. Si uno trae una, la cuenta vuelve a 0. Al llegar a `pity_threshold` (10) sin ninguna, una carta al azar se reemplaza por una épica real del sobre. Una rareza sin cartas en el sobre sale como la más cercana por debajo. La apertura (`app/packs/pack.service.openPackForUser`) es una sola transacción y guarda la semilla y el `opening_id` en `user_card_transactions`.
- `GET /api/packs/available` es pública, pero con token añade `progress` (`packs_until_guarantee`) a cada sobre; `/packs/progress` devuelve lo mismo. `/packs/open` devuelve además `guarantee`, `progress` y `from_guarantee` por carta.

## Otros

- Las modificaciones de colección y monedas pasan por `infrastructure/database/services/transaction.service.ts`, que deja registro en `user_transactions` y `user_card_transactions`.
- Panel de administración: es HTML/JS estático en `src/views/`, se sirve en `/admin` con su propia CSP y su API está en `/api/admin`.
- Las imágenes se sirven estáticamente desde `src/assets` en `/assets`.
- `tools/card-generator/` no forma parte del build (ver "Imágenes de carta" arriba).
- `src/config/starter-deck.config.ts` define el mazo inicial por `card_code`; `assignStarterCards` lo asigna **en el registro** (si faltan las cartas, el registro falla: cargar antes con `seed:cards`).
- `tests/phase8/` incluye, además de los tests de Jest, documentación de pruebas manuales (Postman, SQL).
