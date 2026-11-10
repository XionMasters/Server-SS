# Jugador vs IA

Partidas inmediatas contra un rival que controla el servidor. Sirven para practicar sin esperar rival y, con el autojuego, para probar cartas y reglas sin jugar a mano.

## Cómo se juega

- Lobby → botón **CONTRA LA IA** (debajo de JUGAR).
- Buscando rival, a los 20 s la pantalla de búsqueda ofrece **JUGAR CONTRA LA IA** (cancela la búsqueda).
- La partida es igual que una PvP: quién empieza es al azar, se usa tu mazo activo y la IA juega con un mazo de su facción.
- La IA espera `AI_MOVE_DELAY_MS` entre jugadas (1100 ms por defecto) para que se vean las animaciones.
- Si te desconectas, al volver entras directo a la partida (`match_resumed` trae el `game_state`).

## Piezas

| Archivo | Qué hace |
|---|---|
| `src/app/matches/ai/aiBot.ts` | Identidad de la IA: usuario de sistema con id fijo (`AI_BOT_USER_ID`), `isAiBot()`. También el id del sparring del autojuego. |
| `src/app/matches/ai/aiOpponent.service.ts` | Crea el usuario de la IA (email `.invalid`, contraseña aleatoria: no se puede iniciar sesión con él) y un mazo por facción (`IA · <facción>`) con `randomDeckBuilder`. Lo regenera si deja de ser válido. `createAiMatch(userId)`. |
| `src/app/matches/ai/aiDecision.ts` | Lógica pura: `decideAiMove(estado, jugador, fallidas)` devuelve la siguiente jugada. |
| `src/app/matches/ai/aiTurnRunner.ts` | Juega los turnos de la IA. Se suscribe a `matchesCoordinator.onMatchStateChanged` y ejecuta las jugadas por `handleAction` / `SelectionService`, como un jugador. |
| `src/app/matches/lifecycle/startMatch.service.ts` | `startDirectMatch(jugador, rival, mazoRival)`: partida directa sin cola. |
| `src/interfaces/websocket/handlers/match.handler.ts` | Evento WS `request_ai_match` → `match_found` (+ `vs_ai`, `ai_faction`) y `match_update`. |
| `src/infrastructure/websocket/server.ts` | Engancha el ejecutor, trata a la IA como "conectada" al recuperar partidas y reanuda su turno al reconectar. |
| Cliente: `menus/lobby/match_ai_button.gd`, `MatchmakingService.request_ai_match()` | Botón y petición. La búsqueda (`menus/matchsearch/MatchSearch.gd`) muestra "Invocando a la IA". |

`matches.player2_id` y `player2_deck_id` son claves foráneas, por eso la IA es un usuario y un mazo reales. La IA no necesita tener las cartas en su colección: el reparto lee el mazo directamente. `scripts/giveRandomDecks.ts` ignora a los usuarios de sistema.

## Cómo decide

Solo elige entre lo que `ActionResolver` ya ofrece como válido (`valid_actions`) y lo que pide `pending_selection`, igual que el cliente. No conoce reglas propias. En cada paso:

1. **Selección pendiente suya**: contra el rival elige el caballero más débil; entre cartas propias, la de más valor; en posiciones, la primera visible.
2. **Jugar cartas**: caballeros > escenario (si no tiene uno propio) > ayudante > técnicas que algún caballero propio puede usar > objetos (al caballero más fuerte) > ocasiones; dentro de cada tipo, la más cara. **Ahorra** cosmo si tiene menos de 2 caballeros en campo y un caballero en la mano que aún no puede pagar.
3. **Habilidades activas sin objetivo** (no gastan la acción del caballero).
4. **Acción de cada caballero**, del de más CE al de menos: técnica (la más cara) > ataque básico (prioriza rematar; si solo haría 1 de daño y la mano espera cosmo, carga) > Cargar Cosmo con poco cosmo > Defensa si tiene menos de la mitad de vida.
5. **Terminar el turno.**

Una jugada que el servidor rechaza no se repite en ese turno; tope de 40 jugadas por turno.

**Limitaciones**: no usa habilidades que piden objetivo, no mueve ni sacrifica caballeros, no usa Evasión y no planifica más allá de la jugada actual.

## Autojuego (probar cartas sin jugar)

```powershell
npm run ai:selfplay                                   # 5 partidas IA contra IA
npm run ai:selfplay -- --games 20
npm run ai:selfplay -- --faction Poseidon --ai-faction Athena
npm run ai:selfplay -- --out informe.json             # informe completo en JSON
npm run ai:selfplay -- --verbose                      # con los logs del servidor
```

Juega partidas completas con cartas reales contra la base de datos de `.env`: un lado es la IA y el otro el usuario de sistema "IA Sparring", con un mazo aleatorio nuevo en cada partida. Al final informa de:

- resultado de cada partida (y si se atascó o llegó al límite de 80 turnos),
- **jugadas que el servidor rechazó**, agrupadas por error y cartas implicadas: es lo primero que hay que mirar al añadir o cambiar cartas,
- errores y avisos que registró el motor,
- porcentaje de victorias de quien empieza y duración media.

Sale con código 1 si alguna partida se atascó o dio error.

## Validación (2026-11-09)

- 52 partidas de autojuego (tandas de 2, 20 y 30): todas terminaron, sin jugadas rechazadas ni errores del motor.
- Partida completa por WebSocket (login HTTP, `request_ai_match`, la IA juega sola sus turnos) con la mano rival oculta.
- Reconexión a mitad de partida: `match_resumed` y la partida sigue.
- Tests: `tests/matches/ai-decision.test.ts`.
- Sin probar todavía: el cliente Godot contra el servidor real (las pantallas se comprobaron con datos simulados).

## Observaciones de equilibrio (sin cambios aplicados)

De 30 partidas de autojuego:

- Gana quien empieza el 60 % (muestra pequeña: hay que repetirlo con más partidas).
- Duración media: 7,9 turnos; algunas terminan en el turno 2–4.
- Hay caballeros de **coste 0** (Hyoga, Ikki, Haruto). Un mazo con ellos llena el campo en el turno 2, y 5 ataques directos quitan 10 de las 12 vidas en un turno (ataque directo = 2 de vida).
- Un jugador sin caballeros baratos en la mano inicial casi no puede defenderse: empieza con 0 de cosmo y gana 1 por turno.
