/**
 * ZoneMapper.ts
 *
 * Traducciones canónicas entre zonas del cliente (API/WebSocket) y
 * zonas internas de la base de datos / motor de juego.
 *
 * Regla única: 'field_technique' (cliente) ↔ 'field_support' (BD).
 * Todo lo demás pasa sin cambio.
 *
 * Centralizar aquí evita traducciones ad-hoc dispersas en el código.
 */

/** Zonas tal como las envía el cliente. */
export type ClientZone =
  | 'hand'
  | 'field_knight'
  | 'field_technique'
  | 'field_helper'
  | 'field_occasion'
  | 'field_scenario'
  | 'yomotsu'
  | 'cositos';

/** Zonas tal como se almacenan en la BD / motor. */
export type DbZone =
  | 'hand'
  | 'field_knight'
  | 'field_support'   // ← mismo que field_technique en el cliente
  | 'field_helper'
  | 'field_occasion'
  | 'field_scenario'
  | 'yomotsu'
  | 'cositos';

/** Límite de cartas por zona (BD). 0 = sin límite. */
const ZONE_LIMITS: Record<string, number> = {
  field_knight:   5,
  field_support:  5,
  field_helper:   1,
  field_occasion: 1,
  field_scenario: 1,
};

export const ZoneMapper = {
  /** Zona del cliente → zona de BD. */
  toDatabase(zone: string): string {
    return zone === 'field_technique' ? 'field_support' : zone;
  },

  /** Zona de BD → zona del cliente. */
  toClient(zone: string): string {
    return zone === 'field_support' ? 'field_technique' : zone;
  },

  /**
   * Límite de cartas de la zona (en notación BD).
   * @returns número máximo, o `null` si no hay límite definido.
   */
  maxCards(dbZone: string): number | null {
    return ZONE_LIMITS[dbZone] ?? null;
  },

  /** Devuelve true si esta zona tiene límite de capacidad. */
  isBounded(dbZone: string): boolean {
    return dbZone in ZONE_LIMITS;
  },
};
