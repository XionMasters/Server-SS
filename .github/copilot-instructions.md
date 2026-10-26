# Copilot Instructions: API Caballeros Cósmicos

## 1. Resumen y stack

API TypeScript para **Caballeros Cósmicos**, un juego de cartas coleccionables
táctico por turnos inspirado en Saint Seiya.

- **Backend:** Node.js, TypeScript y Express 5.
- **Tiempo real:** WebSockets mediante `ws`.
- **Base de datos:** PostgreSQL con Sequelize.
- **Estado de partida:** servicios y registros en memoria durante la partida;
  Redis puede incorporarse cuando se requiera persistencia o escalado
  horizontal.
- **Autenticación y seguridad:** JWT Bearer, `bcryptjs`, Helmet, CORS y
  validación de sesión.

## 2. Arquitectura objetivo y flujo de datos

La arquitectura objetivo del proyecto es organizar el código por capas y
responsabilidades. Esta estructura guía el código nuevo y las refactorizaciones
progresivas; no implica mover archivos existentes sin analizar primero sus
dependencias.

El plan operativo, inventario y estado de la migración están en
[`docs/REFACTORING-ROADMAP.md`](../docs/REFACTORING-ROADMAP.md). Consultarlo
antes de iniciar una refactorización estructural.

```text
src/
├── app/
│   ├── auth/
│   ├── decks/
│   ├── collection/
│   ├── chat/
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

### Dependencias entre capas

```text
HTTP / WebSocket
        ↓
Interfaces (routes, controllers y handlers)
        ↓
Application (casos de uso y coordinación)
        ↓
Domain (reglas y engine puro)
        ↓
Repositories / ports
        ↓
Infrastructure (Sequelize, PostgreSQL, memoria y servicios externos)
```

- `domain` debe ser independiente de Express, WebSockets, Sequelize,
  PostgreSQL y Redis.
- `interfaces` adapta protocolos externos a casos de uso; no implementa
  reglas de combate ni acceso directo a modelos.
- `app` contiene casos de uso y orquestación de cada área funcional.
- `infrastructure` implementa persistencia, servidores, autenticación externa,
  correo y otros detalles técnicos.
- `shared` solo contiene utilidades y contratos verdaderamente transversales;
  no debe convertirse en otra carpeta genérica.
- Durante la transición, los módulos actuales pueden permanecer en sus rutas
  originales. Cada movimiento debe ser incremental, conservar compatibilidad y
  eliminar el código legado solo cuando no tenga consumidores.

```text
Cliente
  |
  +--> HTTP (Express) -----------+
  |                               |
  +--> WebSocket (ws) ------------+
                                  |
                          Middleware
                    (autenticación y validación)
                                  |
                 Controllers / WebSocket handlers
                                  |
                   Application / Use Cases
              (casos de uso y coordinación)
                                  |
                         Domain Engine
                   (reglas puras del juego)
                       |                    |
             Repositories          Memoria / Redis
                       |
                 PostgreSQL
```

### Responsabilidades por protocolo

- **HTTP:** autenticación, cartas, colección, mazos, packs, perfil,
  transacciones y matchmaking.
- **WebSockets:** presencia, chat y sincronización de partidas en vivo
  (turnos, acciones y eventos de combate).
- La lógica de negocio no debe duplicarse entre los handlers HTTP y WebSocket.
  Ambos deben delegar en los mismos servicios y validadores.

### Reglas de capas

- **Routes** solo registran endpoints y middleware.
- **Controllers y WebSocket handlers** traducen entradas externas, invocan
  casos de uso y construyen respuestas o eventos.
- **Application** implementa casos de uso, matchmaking, validación de mazos,
  transacciones y coordinación del motor.
- **Domain engine** concentra reglas de combate, habilidades, acciones,
  objetivos y eventos deterministas. Debe ser puro, testeable y no acceder a
  infraestructura.
- **Repositories** definen o implementan el acceso a persistencia sin filtrar
  Sequelize hacia el dominio.
- **Models** representan persistencia y deben vivir en infraestructura en la
  estructura objetivo.
- No usar `services` como carpeta comodín: cada servicio nuevo debe tener una
  responsabilidad clara dentro de `app`, `domain` o `infrastructure`.

## 3. Dominio y persistencia

### Convenciones de enums

Los valores internos siempre están en inglés; las etiquetas de UI pueden estar
en español:

- **Tipos de carta:** `knight`, `technique`, `item`, `stage`, `helper`, `event`.
- **Rarezas:** `common`, `rare`, `epic`, `legendary`, `divine`.
- **Elementos:** `steel`, `fire`, `water`, `earth`, `wind`, `light`, `dark`.
- **Facciones:** `Athena` y futuras facciones como Poseidon o Hades.

### Modelos principales

- **Card:** carta base con UUID, nombre, tipo, rareza, elemento, facción y
  coste.
- **CardKnight:** estadísticas del caballero (`attack_ce`, `armor_ar`,
  `health_lp`, ranuras y modos de combate).
- **CardAbility:** condiciones y efectos dinámicos en JSONB.
- **User:** identidad, credenciales y monedas.
- **UserCard:** colección y cantidad de cartas del usuario.
- **Deck / DeckCard:** mazos, cartas, cantidades, estado activo y metadatos
  visuales.
- **Match / MatchAction:** partida, jugadores, estado y acciones registradas.
- **Packs y transacciones:** compras, recompensas y movimientos de inventario.

Las claves primarias usan UUID (`DataTypes.UUIDV4`) y las columnas de base de
datos usan `snake_case`. Sequelize administra timestamps cuando el modelo los
habilita. Mantener las asociaciones en
[`src/models/associations.ts`](../src/models/associations.ts).

### Estado activo de batalla

El estado transitorio de una partida debe permanecer fuera de PostgreSQL para
evitar I/O innecesario durante cada acción. Actualmente se coordina mediante
servicios y estructuras en memoria; cualquier migración a Redis debe conservar
la misma frontera y considerar serialización, expiración, concurrencia y
recuperación.

```typescript
interface ActiveBattleState {
  matchId: string;
  turnPlayerId: string;
  round: number;
  players: Record<string, {
    lp: number;
    cp: number;
    hand: Card[];
    field: {
      knights: (ActiveKnight | null)[];
      techniques: ActiveTechnique[];
    };
    deckRemaining: number;
  }>;
}
```

No guardar secretos, contraseñas ni tokens en el estado emitido al cliente.
Serializar las cartas con los serializers existentes y aplicar visibilidad de
mano según el jugador.

## 4. Motor de juego y mecánicas

### Acciones de caballero

| Acción | Abreviatura | Lógica |
| --- | --- | --- |
| Batalhar | `BA` | `max(1, CE_atacante - AR_defensor)`. Ataque básico. |
| Técnica | `TA` | Resuelve el efecto de una técnica compatible y activa. |
| Carregar Cosmo | `CC` | Recupera 3 CP y deja al caballero vulnerable según las reglas vigentes. |
| Sacrificar | `SAC` | Elimina un caballero propio y aplica la penalización de DLP. |
| Modo Evasão | `EV` | Tiene 50% de probabilidad de evitar BA; no evita TA. |
| Movimentar | `MOV` | Reubica un caballero en una ranura vacía propia. |
| Modo Defesa | `DEF` | `max(0, (CE_atacante / 2) - AR_defensor)` contra BA y TA. |
| Oração Divina | `OD` | Reservada para reglas específicas aún no definidas. |

Las reglas efectivas del motor y las validaciones existentes tienen prioridad
sobre ejemplos históricos de documentación. Toda ampliación debe mantener
compatibilidad con efectos y condiciones JSONB existentes.

### JSONB de habilidades

```json
{
  "conditions": {
    "min_cosmos": 2,
    "required_element": "fire"
  },
  "effects": {
    "type": "damage_buff",
    "value": 3,
    "target": "self"
  }
}
```

Reutilizar los registros y motores existentes antes de crear nuevas variantes
de resolución de habilidades, daño, turnos o selección de objetivos.

## 5. Mazos, colección y registro inicial

- Un usuario nuevo recibe el mazo inicial configurado en
  [`src/config/starter-deck.config.ts`](../src/config/starter-deck.config.ts).
- El mazo inicial tiene 40 cartas, usa únicamente `common` y `rare`, y queda
  activo al asignarse.
- Las reglas de tamaño, copias y composición deben reutilizar
  [`src/config/deck-rules.config.ts`](../src/config/deck-rules.config.ts) y
  [`src/utils/deckValidator.ts`](../src/utils/deckValidator.ts).
- Las modificaciones de colección y saldo deben ejecutarse mediante los
  servicios/transacciones existentes para evitar cantidades negativas o
  duplicación de recompensas.

## 6. Estándares de implementación

1. Mantener el flujo **route → controller/handler → service → model/repository**.
2. No añadir lógica de combate, matchmaking o validación compleja a
   controllers.
3. Usar tipos explícitos y guards en lugar de `any` o conversiones inseguras.
4. Los mensajes de error dirigidos al cliente deben estar en español y usar el
   formato `{ "error": "mensaje" }`.
5. Devolver explícitamente después de `res.status(...).json(...)`.
6. Usar códigos HTTP coherentes: `200`, `201`, `400`, `401`, `403`, `404` y
   `500` según el caso.
7. No exponer `password_hash`; mantener la exclusión de credenciales en las
   consultas de usuario.
8. Validar autenticación, autorización, payloads y pertenencia de recursos
   antes de mutar partidas, mazos o inventario.
9. Mantener compatibilidad con Sequelize, PostgreSQL y el formato JSONB actual.
10. Actualizar documentación relacionada cuando cambien contratos de API,
    eventos WebSocket o reglas de juego.

## 7. Rutas y superficies principales

- `/api/auth/*`: autenticación y registro.
- `/api/users/*`: operaciones protegidas del usuario.
- `/api/cards/*`: consulta pública de cartas.
- `/api/decks/*`: creación, edición y selección de mazos.
- `/api/user-cards/*`: colección del usuario.
- `/api/matches/*`: matchmaking y partidas.
- `/api/packs/*`: packs y recompensas.
- `/api/profile/*`: perfil y personalización.
- `/api/chat/*`: chat.

Confirmar siempre las rutas actuales antes de documentar o añadir un endpoint.

## 8. Desarrollo y validación

```bash
npm run dev       # Desarrollo con nodemon + ts-node
npm run build     # Compilación TypeScript a dist/
npm test          # Suite Jest
npm start         # Producción desde dist/server.js
```

Scripts de datos frecuentes:

```bash
npm run generate:cards
npm run generate:packs
npm run generate:all
```

El script principal de cartas es
[`src/scripts/generateAllCards.ts`](../src/scripts/generateAllCards.ts).
Revisar variables `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` y `DB_PORT`
antes de ejecutar scripts que escriban en PostgreSQL.

## 9. Seguridad

- Aplicar JWT con expiración configurable (`JWT_EXPIRES_IN`).
- Mantener `bcryptjs` con 12 rondas de salt.
- Validar el origen y el payload de cada conexión WebSocket.
- No confiar en IDs, cantidades, acciones ni resultados enviados por el cliente.
- Usar Helmet, CORS y Morgan conforme a la configuración existente.
- Registrar errores útiles sin incluir tokens, contraseñas ni datos sensibles.
