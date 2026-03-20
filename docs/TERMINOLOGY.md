Glosario de términos — Caballeros Cósmicos

Este documento explica los términos usados en el motor y en el cliente para evitar ambigüedades.

1) Acciones y zonas relacionadas
- Descarta (send to Yomotsu): enviar una carta a la zona `Yomotsu` (cementerio / graveyard). Cartas en Yomotsu pueden ser objetivo de efectos de resurrección y otras interacciones.
- Condena (send to Cositos): enviar una carta a la zona `Cositos` (condena / exilio). Cartas condenadas se tratan como retiradas del juego para la mayoría de efectos (solo habilidades específicas pueden interactuar con Cositos).

Diferencia práctica
- "Descarta" es el comportamiento estándar al eliminar una carta de la mano/tabla: va a Yomotsu y puede ser recuperada por efectos que buscan en el cementerio.
- "Condena" es más permanente: envía a Cositos; generalmente más difícil o imposible de recuperar salvo habilidades concretas que lo permitan.

2) Flujo de selección interactiva
- `request_selection`: acción que pide al cliente que elija una carta de una zona (p. ej. `hand`, `yomotsu`, `deck`).
- `pending_selection`: estructura que el servidor añade al estado del match cuando espera la respuesta del cliente.
- `resolve_selection`: evento WS enviado por el cliente con la opción elegida (`chosen_card_id`).
- `selected`: en `on_select` se refiere a la carta elegida por el jugador al resolver la selección.
- `on_select`: lista de acciones que se ejecutan al resolverse la selección (ej: `send_to_zone`, `draw_card`).

Ejemplo (flujo):
- Se activa `request_selection` con `zone: "hand"` → servidor crea `pending_selection` → cliente muestra UI → jugador elige carta → cliente envía `resolve_selection` → servidor valida y ejecuta `on_select`.

3) Acciones comunes (resumen)
- `send_to_zone`: mueve la carta objetivo a la zona indicada (`hand`, `field`, `cositos`, `yomotsu`, etc.).
- `draw_card`: roba N cartas del mazo a la mano del jugador. En el servidor esto se realiza mediante `CardDrawService` para persistir y emitir eventos.
- `shuffle_deck`: mezcla el mazo del jugador.
- `request_selection`: ver arriba.

4) Abreviaturas y atributos de cartas / jugadores
- `Ar` — Armadura / Defensa del caballero (valor que reduce daño recibido).
- `Ce` — Combate / Capacidad de ataque del caballero (valor base de daño en ataques).
- `Cp` — Cosmos Points del caballero (recursos internos del caballero para técnicas; en el motor se usa para gestionar costos/energía a nivel de carta).
- `Lp` — Life Points del caballero (vida individual del caballero en tablero).
- `PLP` — Player Life Points (vida del jugador). Sugerencia: usar `PLP` como abreviatura clara del total de vida del jugador.
- `PCP` — Player Cosmos Points (recursos del jugador para jugar cartas y activar habilidades). Sugerencia: `PCP` = Puntos de Cosmos del Jugador.

Notas sobre uso
- `PCP` se consume para jugar cartas o activar ciertas habilidades. No confundir con `Cp`, que suele ser una propiedad de la carta/caballero.
- `PLP` representa la vida del jugador global (si llega a 0, pierde la partida); `Lp` es la vida de un caballero individual.

5) Otros términos útiles
- `Hand` (mano): conjunto de cartas que tiene un jugador en la mano.
- `Deck` (mazo): pila de la que se roban cartas.
- `Field` / `Battlefield`: las posiciones donde se colocan los `knight` y `technique` en juego.
- `Helper` / soporte: cartas de apoyo que no ocupan slots de caballero.
- `Effect` / `Ability`: un efecto asociado a una carta (definido en JSONB `effects`/`conditions`).

6) Convenciones para el cliente
- Cuando el servidor envía `pending_selection`, el cliente debe mostrar solo las cartas que cumplen `pending.selection.filter`. El cliente no debe permitir elegir cartas fuera de esa lista.
- En `on_select`, el uso de `target: "selected"` siempre se refiere a la `chosen_card_id` enviada por el cliente.
- Mostrar claramente en la UI la diferencia entre "Descartar" y "Condenar" (por ejemplo: iconos y texto: "Enviar a Yomotsu (descartar)" vs "Enviar a Cositos (condena)").

7) Ejemplo del JSON que me mostraste (explicado):
```
{
  "actions": [
    {
      "type": "request_selection",
      "zone": "hand",
      "filter": {},
      "on_select": [
        { "type": "send_to_zone", "target": "selected", "destination": "cositos" },
        { "type": "draw_card", "amount": 2 }
      ],
      "destination": "cositos"
    }
  ],
  "trigger": "CARD_PLAYED",
  "conditions": [ { "type": "hand_not_empty" } ]
}
```
- Al jugar la carta (trigger `CARD_PLAYED`) y si `hand_not_empty` → se pide al jugador elegir carta de su mano.
- Al resolver (`on_select`): la carta elegida se envía a `cositos` (condena) y luego el jugador roba 2 cartas.

8) Recomendaciones finales
- Establecer en el cliente una sección de ayuda rápido con estas definiciones (ícono + una línea de texto por término).
- Mantener consistencia en las abreviaturas (`PLP`, `PCP`, `Lp`, `Cp`) en todo el UI para evitar confusiones.
- Documentar en el repositorio (como este archivo) y añadir una versión reducida dentro del cliente (ej: `Help > Términos`) con enlaces a la documentación completa.

¿Quieres que añada más términos (por ejemplo: agotado/exhausted, modo defensa/defense, evasión/evade, fases del turno), o que coloque este archivo dentro del cliente `ccg/` también? 

9) Términos adicionales (detallados)
- `Exhausted` / Agotado: estado de una carta o caballero que le impide actuar hasta que se recupere. Normalmente una carta entra en `exhausted` tras ser jugada o usar una acción que la consume; se indica visualmente (p. ej. girada/atenuada).
- `Modo Defensa` / Block: postura que reduce el daño recibido. En cálculo de daño se aplica la regla de defensa (p. ej. `(CE_atacante / 2) - AR_defensor`).
- `Evasión` / Evade: postura o estado que otorga una probabilidad de evitar por completo ataques básicos (BA). En el juego descrito usa un lanzamiento de moneda: cara = golpe, cruz = falla. Evade normalmente no afecta técnicas (TA).
- `Agotar/Exhaust` vs `Tap` vs `Ready`: convenciones visuales y mecánicas para indicar si una carta ha sido usada en el turno.

- `Charge Cosmos` / Cargar Cosmo: acción que recupera PCP del jugador o Cp del caballero (según diseño). Suele conllevar un trade-off (p. ej. abrirse a ataques posteriores).
- `Sacrificar` / Sacrifice: eliminar voluntariamente un caballero propio para obtener un beneficio (p. ej. espacio en tablero, coste para otra acción). Puede causar penalización de vida o recursos.
- `Mover` / Move: desplazar un caballero a otra posición vacía de tu lado del tablero.
- `Oración Divina` / Divine Prayer: habilidad especial dependiendo del diseño de la carta; documentar caso por caso.

10) Fases del turno (sugeridas)
- `Inicio` / Start Phase: efectos que ocurren al comienzo del turno (recuperaciones automáticas, triggers de inicio).
- `Draw Phase` / Robar: etapa donde el jugador roba cartas del mazo.
- `Main Phase` / Fase Principal: jugar cartas, activar habilidades, preparar el campo.
- `Battle Phase` / Fase de Batalla: resolver ataques entre caballeros (BA/TA) y efectos de combate.
- `End Phase` / Fase Final: limpiar efectos temporales, preparar el turno del oponente.

11) Estados y efectos (breve)
- `Buff`: efecto positivo temporal (ej: +CE, +AR, resistencia).
- `Debuff`: efecto negativo temporal (ej: -CE, -AR, stun).
- `Stun` / Aturdido: estado que previene acciones del caballero durante X turnos.
- `Attached effects`: efectos "adjuntos" a una carta (p. ej. equipamientos, runas) que viajan con la carta y pueden persistir al moverse entre zonas según la regla.

- Estados de daño por turno / control de unidad:
  - `Veneno` / Poison: inflige daño al inicio o final de cada turno durante N turnos. No suele afectar otras estadísticas, pero reduce gradualmente `Lp` del caballero o `PLP` si el efecto lo especifica.
  - `Quemado` / Burned: inflige daño cuando el caballeto actua, ya sea atacar, usar una tecnica, usar habilidad o pasar a estado evasion/defensa.
  - `Congelado` / Frozen: impide que el caballero realice acciones durante X turnos (no puede atacar ni moverse). En algunos diseños se rompe si recibe daño.
  - `Paralizado` / Paralyzed: impide o reduce la probabilidad de actuar (por ejemplo, salta turnos o aplica checks para poder actuar). Diferente de `Stun` en que puede permitir acciones con probabilidad o con penalizaciones.

Si se añaden nuevos estados en el futuro (p. ej. `Bleed`, `Root`, `Silence`), documentarlos aquí y añadir sus interacciones con `CE`, `AR`, `Cp` y fases del turno.

12) Notas de diseño para el cliente
- Mostrar tooltips cortos para `PLP`, `PCP`, `Lp`, `Cp`, `Ar`, `Ce` cuando el usuario pase el cursor por los HUDs.
- En la UI de selección (`pending_selection`) incluir la razón/label (p. ej. "Selecciona una carta para CONDENAR (enviar a Cositos)").
- Iconos sugeridos: `Yomotsu` = tumba/cementerio; `Cositos` = urna/banimento para distinguir visualmente.

Si quieres, genero también una versión corta (120–200 caracteres por término) para usar directamente en tooltips del cliente. ¿Lo genero ahora y la coloco en `ccg/assets/translations/es.json` como `help.terms`? 