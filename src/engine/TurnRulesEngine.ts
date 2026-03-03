/**
 * TurnRulesEngine.ts
 * 
 * Motor PURO de reglas de turno.
 * ✅ SIN BD
 * ✅ SIN await
 * ✅ SIN Sequelize
 * ✅ Determinístico
 * ✅ Testeable sin servidor
 * 
 * Entrada: GameState (snapshot)
 * Salida: { valid: boolean, error?: string } u { newState: GameState }
 * 
 * Responsabilidades:
 * - Validar que un turno sea legal (¿es su turno?, ¿fase válida?)
 * - Ejecutar lógica de fin de turno (cambiar jugador, otorgar cosmos, etc.)
 * - Retornar nuevo estado (inmutable)
 */

import { GameState } from './GameState';
import { deriveModeFromEffects, computeCeBonus, computeArBonus, tickStatusEffects } from './StatusEffects';
import { BASE_MATCH_RULES } from '../game/rules/base.rules';

export class TurnRulesEngine {
  /**
   * Valida si un jugador puede terminar su turno
   * 
   * Reglas validadas:
   * 1. ¿Es el turno del jugador?
   * 2. ¿La fase es válida?
   * 3. ¿El estado está en condición de terminar turno?
   * 
   * @param state GameState snapshot
   * @param playerNumber Número del jugador (1 o 2)
   * @returns { valid: boolean, error?: string }
   */
  static validateEndTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string } {
    // Regla 1: ¿Es su turno?
    if (state.current_player !== playerNumber) {
      return {
        valid: false,
        error: `No es turno del jugador ${playerNumber}. Turno actual: ${state.current_player}`,
      };
    }

    // Regla 2: ¿Fase válida?
    const validPhases = ['player1_turn', 'player2_turn'];
    if (!validPhases.includes(state.phase)) {
      return {
        valid: false,
        error: `Fase inválida para terminar turno: ${state.phase}`,
      };
    }

    // Regla 3: ¿Partida no finalizada?
    if (state.phase === 'game_over') {
      return {
        valid: false,
        error: 'No puedes terminar turno en partida finalizada',
      };
    }

    // Todos los checks pasaron
    return { valid: true };
  }

  /**
   * Ejecuta fin de turno
   * 
   * Mutaciones:
   * 1. Cambiar jugador actual
   * 2. Cambiar fase
   * 3. Incrementar número de turno (solo cuando vuelve a jugador 1)
   * 4. Otorgar cosmos al siguiente jugador (según BASE_MATCH_RULES)
   * 5. (Futuro) Resetear flags de ataque
   * 6. (Futuro) Robar carta
   * 
   * CRÍTICO: Usa structuredClone para inmutabilidad
   * Node 18+: structuredClone disponible
   * Alternativa para Node < 18: JSON.parse(JSON.stringify(state))
   * 
   * @param state GameState snapshot
   * @param playerNumber Número del jugador (1 o 2)
   * @returns { newState: GameState }
   */
  static endTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { newState: GameState } {
    // 🔒 INMUTABILIDAD: Clonar estado (NO mutamos el original)
    // structuredClone es más seguro que JSON.parse(JSON.stringify(...))
    const newState = structuredClone(state);

    // Calcular próximo jugador
    const nextPlayer = playerNumber === 1 ? 2 : 1;

    // 1️⃣ Cambiar jugador actual
    newState.current_player = nextPlayer;

    // 2️⃣ Cambiar fase
    newState.phase = nextPlayer === 1 ? 'player1_turn' : 'player2_turn';

    // 3️⃣ Incrementar número de turno (solo cuando vuelve a jugador 1)
    if (nextPlayer === 1) {
      newState.current_turn += 1;
    }

    // 4️⃣ Otorgar cosmos al siguiente jugador
    const cosmosPerTurn = BASE_MATCH_RULES.turn.cosmos_per_turn;
    const cosmosIncrease = typeof cosmosPerTurn === 'function' ? cosmosPerTurn(newState.current_turn) : cosmosPerTurn;
    const nextPlayerObj = newState[nextPlayer === 1 ? 'player1' : 'player2'];
    nextPlayerObj.cosmos += cosmosIncrease;

    // 5️⃣ Procesar status_effects del siguiente jugador:
    //    - Decrementar remaining_turns de cada efecto
    //    - Eliminar efectos expirados (remaining_turns <= 0)
    //    - Recomputar mode, ce y ar desde los efectos restantes
    const allNextPlayerCards = [
      ...nextPlayerObj.field_knights,
      ...nextPlayerObj.field_techniques,
      ...(nextPlayerObj.field_helper ? [nextPlayerObj.field_helper] : []),
      ...(nextPlayerObj.field_occasion ? [nextPlayerObj.field_occasion] : []),
    ];

    for (const card of allNextPlayerCards) {
      card.status_effects = tickStatusEffects(card.status_effects ?? []);
      card.mode = deriveModeFromEffects(card.status_effects);
      card.ce   = card.base_ce + computeCeBonus(card.status_effects);
      card.ar   = card.base_ar + computeArBonus(card.status_effects);
    }

    // Resetear flags de exhaust del siguiente jugador (puede volver a atacar)
    const fieldsToReset = [
      nextPlayerObj.field_knights,
      nextPlayerObj.field_techniques,
    ];
    fieldsToReset.forEach(field => {
      field?.forEach(card => {
        card.is_exhausted = false;
        card.attacked_this_turn = false;
      });
    });

    // 6️⃣ Robar carta: decrementar deck_count en el estado puro
    // La carta real se mueve en CardInPlay (BD) dentro de TurnManager
    if (nextPlayerObj.deck_count > 0) {
      nextPlayerObj.deck_count -= 1;
    }

    // Actualizar timestamp
    newState.updated_at = Date.now();

    return { newState };
  }

  /**
   * (FUTURO) Simulación: ¿Qué pasaría si termino el turno?
   * Útil para IA, validación offline, etc.
   * 
   * Por ahora es igual a endTurn, pero permitirá lógica más compleja
   */
  static simulateEndTurn(
    state: GameState,
    playerNumber: 1 | 2
  ): { valid: boolean; error?: string; simulatedState?: GameState } {
    // Primero validar
    const validation = this.validateEndTurn(state, playerNumber);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }

    // Luego ejecutar
    const result = this.endTurn(state, playerNumber);
    return { valid: true, simulatedState: result.newState };
  }
}
