# Caballeros Cosmicos - Reglas Tecnicas para Backend

## Objetivo
Este documento traduce las reglas de juego a criterios implementables en API/WS para validacion, procesamiento y broadcast de estado.

Fuente funcional principal: docs de cliente en ccg/docs/GameDesign.md.

## Convenciones Canonicas

### Tipos de carta (interno, obligatorio)
- knight
- technique
- item
- stage
- helper
- event

### Rareza (interno, obligatorio)
- common
- rare
- epic
- legendary
- divine

### Zonas en estado de partida
- deck
- hand
- field_knight
- field_support
- field_helper
- field_occasion
- field_scenario
- yomotsu

Nota de serializacion:
- Al cliente se serializa field_support como field_technique.

## Limites de campo (validacion)
- field_knight: max 5 por jugador.
- field_helper: max 1 por jugador.
- field_support/field_technique: max 5 por jugador.
- field_occasion: slot unico por jugador.
- field_scenario: max 1 global.
- hand: max 7 (regla de fase/inicio y descarte por excedente en capa de reglas).

Referencia de validacion de posiciones: ActionResolver.

## Sistema de Cosmos

### PCP (cosmos del jugador)
- +1 al inicio de turno.
- maximo recomendado: 10.
- no se resetea al cambiar turno.

### Costos
- Jugar carta: descuenta PCP segun costo.
- Activar habilidad: descuenta PCP y/o recurso propio segun definicion.

### Accion explicita de carga
- CHARGE_COSMOS: gana 3 CP para el jugador activo.
- Esta accion debe respetar reglas de turno/fase y limites de recursos.

## Combate

## Acciones principales
- ATTACK
- CHANGE_DEFENSIVE_MODE
- USE_ABILITY

## Posturas
- normal
- defense
- evasion
- prayer (reservada / extensible)

## Resolucion de dano
Modo normal:
- dano = max(1, ce_atacante - ar_defensor)

Modo defense:
- dano = max(1, floor(ce_atacante / 2) - ar_defensor)

Modo evasion:
- probabilidad 50% de evitar dano (evaded=true).
- si conecta: dano normal con maximo de armadura y dano minimo 1.

Notas:
- ignore_armor puede forzar AR efectivo en 0.
- Se emiten eventos de motor para damage dealt, attack connected y derivados.

## Yomotsu y Cositos
- Yomotsu es la zona de descarte/caidos implementada en estado y persistencia.
- Cositos (exilio) no esta normalizado como zona canonicamente separada en el flujo principal actual.
- Recomendacion tecnica: introducir zona exile en modelo/serializador para soportar Cositos sin sobrecargar yomotsu.

## Flujo de turno (server-driven)

Fase base prevista:
1. Draw
2. Main
3. Battle
4. End

Acciones por fase (cliente y servidor deben mantener coherencia):
- Draw: draw_card
- Main: play_card, activate_technique
- Battle: declare_attack
- End: end_turn

Servidor determina estado final de turno y emite match_update.

## Transporte y contratos de accion

### WebSocket (principal)
Eventos de entrada del cliente:
- play_card
- declare_attack
- end_turn
- change_defensive_mode
- charge_cosmos
- sacrifice_knight
- move_knight
- use_ability
- start_first_turn
- request_match_state

Mapeo interno en router/coordinator a tipo de accion:
- PLAY_CARD
- ATTACK
- END_TURN
- CHANGE_DEFENSIVE_MODE
- CHARGE_COSMOS
- SACRIFICE_KNIGHT
- MOVE_KNIGHT
- USE_ABILITY
- START_FIRST_TURN

Requisito operativo:
- action_id obligatorio para acciones mutables con idempotencia.

### HTTP (estado actual)
- Endpoint de estado de partida disponible.
- Endpoints HTTP de accion de partida estan marcados como deprecated frente a WebSocket.

## Criterios de validacion minimos por accion
- Match existe y usuario pertenece al match.
- Es turno del jugador para acciones de turno.
- Fase permite la accion.
- Costos de recurso validos.
- Zona/posicion destino valida segun tipo de carta.
- Carta fuente existe y esta en zona esperada.
- No duplicar accion idempotente por action_id.

## Eventos de salida
- match_update con perspectiva por jugador.
- error tipado con code y message cuando la accion falla.
- eventos de dominio (engine_events) filtrados por visibilidad del receptor.

## Checklist de consistencia al implementar nuevas reglas
- Actualizar validador de zonas/slots.
- Actualizar mapeo de acciones en coordinator/router.
- Actualizar serializador de zonas hacia cliente.
- Actualizar pruebas de idempotencia y turnos.
- Actualizar GameDesign y guia UX del cliente.

## Estado del documento
Version tecnica: Abril 2026.
