/**
 * AbilityTypes.ts
 *
 * Contratos centrales del sistema de habilidades activas.
 *
 * Una habilidad activa implementa `Ability` y se registra en `AbilityRegistry`.
 * `ActionResolver` delega completamente en este sistema: nunca conoce
 * habilidades individuales.
 *
 * EXTENSIÓN:
 *   1. Crear `src/game/abilities/mi_habilidad.ability.ts`
 *   2. Implementar `Ability`
 *   3. Registrar en `AbilityRegistry`
 *   → ActionResolver no se toca.
 */

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toda la información que una habilidad puede necesitar para decidir si está disponible.
 * Se amplía aquí cuando futuras habilidades necesiten más contexto (e.g. scenario, turn number).
 */
export interface AbilityContext {
  /** La carta (knight) que podría usar la habilidad. Tipado como any mientras CardInstance exista solo en GameState. */
  knight: any;

  /** Estado del match serializado (viene de la BD, no del GameState puro). */
  matchState: any;

  /** Todas las cartas en juego del match (para habilidades que dependen del campo global). */
  cardsInPlay: any[];
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERFAZ BASE
// ─────────────────────────────────────────────────────────────────────────────

export interface Ability {
  /** Identificador interno de la habilidad. Debe coincidir con `ability_name` en la BD. */
  name: string;

  /** Costo en CP (Cosmos Points de la carta) para activarla. */
  cosmos_cost: number;

  /**
   * Si true, el cliente debe seleccionar un caballero enemigo objetivo antes de enviar USE_ABILITY.
   * El coordinator valida que `targetId` esté presente y sea un caballero rival en campo.
   */
  requires_target?: boolean;

  /**
   * Devuelve true si esta habilidad está disponible para el caballero en el contexto dado.
   * Solo se llama cuando el caballero aún no ha actuado en este turno.
   */
  canUse(ctx: AbilityContext): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULTADO
// ─────────────────────────────────────────────────────────────────────────────

/** Forma serializada que recibe el cliente. */
export interface ResolvedAbility {
  ability_name: string;
  cosmos_cost: number;
  /** Si true, el cliente debe mostrar un selector de objetivo antes de confirmar. */
  requires_target?: boolean;
}
