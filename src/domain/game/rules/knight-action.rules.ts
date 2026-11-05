/**
 * Acción del caballero: cada caballero hace UNA acción por turno.
 *
 * Batallar (BA), Técnica (TA), Cargar Cosmo (CC), Modo Evasión (EV), Modo Defensa (DEF)
 * y Mover (MOV) terminan el turno del caballero: después ya no puede hacer nada más
 * (tampoco usar sus habilidades activas). Sacrificar (SAC) lo retira del campo.
 * Las habilidades activas no gastan la acción: se pueden usar antes de actuar.
 *
 * La marca se guarda en `attacked_this_turn` / `is_exhausted` (columnas has_attacked_this_turn /
 * can_attack_this_turn) y se limpia al inicio del siguiente turno del dueño (TurnRulesEngine).
 */

export const KNIGHT_ALREADY_ACTED_ERROR = 'Este caballero ya actuó este turno';

interface KnightActionFlags {
  attacked_this_turn?: boolean;
  is_exhausted?: boolean;
}

/** True si el caballero ya usó su acción del turno. */
export function hasKnightActed(knight: KnightActionFlags | null | undefined): boolean {
  return knight?.attacked_this_turn === true || knight?.is_exhausted === true;
}

/** Marca que el caballero usó su acción del turno. */
export function markKnightActed(knight: KnightActionFlags): void {
  knight.attacked_this_turn = true;
  knight.is_exhausted = true;
}
