# TODO Black abilities

Este archivo lista efectos detectados en src/assets/black/data.json que aun no existen en el motor declarativo actual.

Acciones soportadas hoy: apply_status, apply_damage, apply_player_damage, apply_cosmos_damage, kill, heal, summon_from_zone, coin_flip_then, request_selection, send_to_zone, shuffle_deck, draw_card.

## Efectos pendientes por implementar

- Black Altar Avido :: Black Alchemy -> cost
- Black Altar Avido :: Black Alchemy -> draw_cards
- Black Altar Avido :: Black Saint -> modify_stat
- Black Andromeda :: Black Saint -> modify_stat
- Black Crow :: Black Saint -> modify_stat
- Black Crow :: Dark Effect -> summon_token
- Black Cygnus :: Black Saint -> modify_stat
- Black Cygnus :: Dark Effect -> modify_stat
- Black Dragon :: Black Saint -> modify_stat
- Black Dragon :: Dark Effect -> modify_stat
- Black Hound :: Black Saint -> modify_stat
- Black Hound :: Dark Effect -> reveal_hand
- Black Hound Yudo :: Black Saint -> modify_stat
- Black Hound Yudo :: Dark Effect -> grant_immunity
- Black Pegasus :: Black Saint -> modify_stat
- Shadow Phoenix :: Black Saint -> modify_stat
- Shadow Phoenix :: Shadow Effect -> summon_from_deck

## Nota
Estas cartas si se importan en base de datos. El TODO solo afecta su ejecucion de habilidades en runtime.
