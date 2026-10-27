/**
 * FieldEffectsEngine.ts
 *
 * Motor puro (sin acceso a BD) para efectos de campo:
 *   - Auras de escenarios (cartas 'stage' en field_scenario)
 *   - Buffs de objetos/equipamiento (cartas 'item' en field_technique)
 *
 * ─── Por qué existe este archivo ───────────────────────────────────────────
 *
 * PROBLEMA con el enfoque anterior (que fue eliminado de CardManager):
 *   Aplicar boosts como StatusEffects persistidos en el card_in_play tiene
 *   varios problemas graves:
 *     1. Estado obsoleto: si el escenario es destruido, ¿quién limpia los
 *        ce_boost / ar_boost de todos los caballeros afectados?
 *     2. Actualizaciones masivas: jugar un escenario requeriría un UPDATE
 *        a todos los caballeros en campo de ambos jugadores.
 *     3. Inconsistencias: un caballero jugado DESPUÉS del escenario no
 *        recibiría el boost (o requeriría lógica extra en CardManager).
 *
 * SOLUCIÓN correcta (Phase 2 - LayerResolver):
 *   Los efectos de campo se evalúan DINÁMICAMENTE justo antes de cada
 *   cálculo de combate. No se persisten en BD. El pipeline de combate
 *   llama a getScenarioBonuses() y getItemBonuses() y suma los valores
 *   al CE/AR del caballero en ese momento.
 *
 * ─── Estado actual ─────────────────────────────────────────────────────────
 *
 * PENDIENTE Phase 2: las interfaces y métodos están definidos pero aún no
 * son llamados desde AttackRulesEngine ni KnightRulesEngine.
 *
 * Integración prevista (Phase 2):
 *
 *   // En AttackRulesEngine.attack() antes del cálculo de daño:
 *   const scenarioBonuses = FieldEffectsEngine.getScenarioBonuses(attackerSnap, scenarios);
 *   const itemBonuses     = FieldEffectsEngine.getItemBonuses(attackerSnap, attackerPos, playerItems);
 *   const totalCeBonus    = [...scenarioBonuses, ...itemBonuses].reduce((s, b) => s + b.ce, 0);
 *   const totalArBonus    = [...scenarioBonuses, ...itemBonuses].reduce((s, b) => s + b.ar, 0);
 *   const effectiveCE = attacker.ce + totalCeBonus;
 *   const effectiveAR = defender.ar + totalArBonus;
 *
 */

// ─── Tipos de datos ─────────────────────────────────────────────────────────

/**
 * Bonus de CE/AR otorgado por una carta de campo activa.
 */
export interface FieldBonus {
  /** Bonus de CE (Combat Effectiveness) */
  ce: number;
  /** Bonus de AR (Armor Rating) */
  ar: number;
  /** instance_id de la carta de campo que otorga el bonus (para debug/log) */
  source_instance_id: string;
  /** Nombre legible de la carta fuente (para debug) */
  source_name: string;
}

/**
 * Snapshot mínimo de un caballero necesario para evaluar condiciones de aura.
 * No es el modelo Sequelize completo — solo los campos relevantes para matching.
 */
export interface KnightSnapshot {
  instance_id: string;
  rank: string | null;       // Ej: 'Bronze Saint', 'Steel Saint', 'Gold Saint'
  element: string | null;    // Ej: 'steel', 'fire', 'water'
  faction: string | null;    // Ej: 'Athena', 'Poseidon', 'Hades'
}

/**
 * Snapshot de una carta de campo activa (stage o item).
 * Se construye desde {CardInPlay + Card + CardAbility} del GameState.
 */
export interface FieldCardSnapshot {
  instance_id: string;
  card_name: string;
  player_number: number;  // 1 o 2 (relevante para items; stages son globales)
  position: number;       // slot (0–4) — relevante para items
  abilities: Array<{
    type: string;          // 'campo' | 'equipamiento' | 'activa' | 'pasiva'
    effects: Record<string, any>;
  }>;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class FieldEffectsEngine {
  /**
   * Calcula los bonos de CE y AR que recibe un caballero a partir de los
   * escenarios activos en field_scenario.
   *
   * Los escenarios son una zona COMPARTIDA: afectan a los caballeros de
   * AMBOS jugadores que cumplan las condiciones del aura.
   *
   * @param knight    Snapshot del caballero evaluado
   * @param scenarios Cartas activas en field_scenario
   *
   * @example
   * // El Santuario: field_aura { rank: "Steel Saint", ce: 2, ar: 2 }
   * // → Jabu (Bronze Saint) no recibe el bonus
   * // → Un Steel Saint sí lo recibe
   *
   * TODO Phase 2: llamar desde AttackRulesEngine y KnightRulesEngine.
   */
  static getScenarioBonuses(
    knight: KnightSnapshot,
    scenarios: FieldCardSnapshot[]
  ): FieldBonus[] {
    const bonuses: FieldBonus[] = [];

    for (const scenario of scenarios) {
      for (const ability of scenario.abilities) {
        if (ability.type !== 'campo') continue;

        const aura = ability.effects?.field_aura;
        if (!aura) continue;

        if (this._knightMatchesAura(knight, aura)) {
          bonuses.push({
            ce: aura.ce ?? 0,
            ar: aura.ar ?? 0,
            source_instance_id: scenario.instance_id,
            source_name: scenario.card_name,
          });
        }
      }
    }

    return bonuses;
  }

  /**
   * Calcula los bonos de CE y AR que recibe un caballero a partir de los
   * objetos/equipamiento de su mismo jugador en field_technique.
   *
   * La asociación es por SLOT: un objeto en posición N afecta al caballero
   * en posición N de field_knight.
   *
   * @param knight         Snapshot del caballero evaluado
   * @param knightPosition Posición del caballero en field_knight (0–4)
   * @param playerItems    Objetos activos del mismo jugador en field_technique
   *
   * TODO Phase 2: llamar desde AttackRulesEngine y KnightRulesEngine.
   */
  static getItemBonuses(
    knight: KnightSnapshot,
    knightPosition: number,
    playerItems: FieldCardSnapshot[]
  ): FieldBonus[] {
    const bonuses: FieldBonus[] = [];

    // Solo los objetos en el mismo slot que el caballero
    const sameSlotItems = playerItems.filter(i => i.position === knightPosition);

    for (const item of sameSlotItems) {
      for (const ability of item.abilities) {
        // Los objetos pueden tener habilidades 'equipamiento' (efecto directo en stats)
        // o 'campo' (efecto condicional tipo aura)
        if (ability.type !== 'equipamiento' && ability.type !== 'campo') continue;

        const aura = ability.effects?.field_aura;
        if (!aura) continue;

        if (this._knightMatchesAura(knight, aura)) {
          bonuses.push({
            ce: aura.ce ?? 0,
            ar: aura.ar ?? 0,
            source_instance_id: item.instance_id,
            source_name: item.card_name,
          });
        }
      }
    }

    return bonuses;
  }

  // ─── Privados ──────────────────────────────────────────────────────────────

  /**
   * Evalúa si un caballero cumple las condiciones de un aura JSONB.
   *
   * Condiciones soportadas (cualquier combinación, todas deben cumplirse):
   *   { rank: "Bronze Saint" }    → el caballero debe tener ese rango
   *   { element: "steel" }        → el caballero debe tener ese elemento
   *   { faction: "Athena" }       → el caballero debe pertenecer a esa facción
   *   {}                          → sin restricción, aplica a todos
   *
   * Futuras condiciones planificadas:
   *   { rarity: "legendary" }     → solo caballeros legendarios (colores carta)
   *   { type: "knight" }          → ya implícito, todos en field_knight son knights
   */
  private static _knightMatchesAura(
    knight: KnightSnapshot,
    aura: Record<string, any>
  ): boolean {
    if (aura.rank    && knight.rank    !== aura.rank)    return false;
    if (aura.element && knight.element !== aura.element) return false;
    if (aura.faction && knight.faction !== aura.faction) return false;
    return true;
  }
}
