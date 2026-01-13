import Match from '../../models/Match';
import CardInPlay from '../../models/CardInPlay';
import MatchAction from '../../models/MatchAction';

/**
 * 🔥 ATTACK MANAGER
 * Maneja toda la lógica de ataque entre caballeros
 */
export class AttackManager {
  /**
   * Ejecuta un ataque básico (BA)
   * Fórmula: [CE_ATTACKER] - [AR_DEFENDER] = [DAMAGE]
   * Mínimo daño: 1
   *
   * Casos especiales:
   * - Si defensor está en evasión: 50% chance de fallar
   * - Si defensor está en defensa: mitad del ataque del atacante
   */
  static async performBasicAttack(
    match: Match,
    attackerCardInPlay: CardInPlay,
    defenderCardInPlay: CardInPlay
  ): Promise<{
    damage: number;
    hit: boolean;
    reason?: string;
  }> {
    const attackerCard = (attackerCardInPlay as any).card;
    const attackerKnight = (attackerCard as any).card_knight;

    const defenderCard = (defenderCardInPlay as any).card;
    const defenderKnight = (defenderCard as any).card_knight;

    // Obtener valores de CE y AR
    const attackCE = attackerKnight.attack || 0;
    const defenseAR = defenderKnight.defense || 0;

    // Comprobar modo evasión (50% chance de fallar)
    if (defenderCardInPlay.is_defensive_mode === 'evasion') {
      const coinFlip = Math.random() > 0.5; // true = hit, false = miss
      if (!coinFlip) {
        return {
          damage: 0,
          hit: false,
          reason: 'EVASION_MISS'
        };
      }
    }

    // Comprobar modo defensa (reducir daño a la mitad)
    let calculatedAttack = attackCE;
    if (defenderCardInPlay.is_defensive_mode === 'defense') {
      calculatedAttack = Math.floor(attackCE / 2);
    }

    // Calcular daño
    let damage = calculatedAttack - defenseAR;
    if (damage < 1) {
      damage = 1; // Mínimo 1 de daño
    }

    return {
      damage,
      hit: true
    };
  }

  /**
   * Ejecuta ataque y actualiza salud del defensor
   */
  static async executeAttack(
    match: Match,
    attackerCardInPlay: CardInPlay,
    defenderCardInPlay: CardInPlay
  ): Promise<{
    damage: number;
    hit: boolean;
    defenderHealth: number;
    isKnockedOut: boolean;
  }> {
    // Calcular daño
    const attackResult = await this.performBasicAttack(
      match,
      attackerCardInPlay,
      defenderCardInPlay
    );

    if (!attackResult.hit) {
      return {
        damage: 0,
        hit: false,
        defenderHealth: defenderCardInPlay.current_health,
        isKnockedOut: false
      };
    }

    // Aplicar daño
    const newHealth = Math.max(
      0,
      defenderCardInPlay.current_health - attackResult.damage
    );
    defenderCardInPlay.current_health = newHealth;
    await defenderCardInPlay.save();

    // Marcar atacante como que ya atacó este turno
    attackerCardInPlay.has_attacked_this_turn = true;
    await attackerCardInPlay.save();

    return {
      damage: attackResult.damage,
      hit: true,
      defenderHealth: newHealth,
      isKnockedOut: newHealth <= 0
    };
  }

  /**
   * Cambia modo defensivo de un caballero
   * Modos: 'normal', 'defense', 'evasion'
   */
  static async changeDefensiveMode(
    cardInPlay: CardInPlay,
    newMode: 'normal' | 'defense' | 'evasion'
  ): Promise<void> {
    const validModes = ['normal', 'defense', 'evasion'];
    if (!validModes.includes(newMode)) {
      throw new Error(`Modo inválido: ${newMode}`);
    }

    cardInPlay.is_defensive_mode = newMode;
    await cardInPlay.save();
  }

  /**
   * Registra una acción de ataque
   */
  static async recordAttack(
    matchId: string,
    userId: string,
    attackerCardId: string,
    defenderCardId: string,
    damage: number,
    hit: boolean,
    turnNumber: number
  ): Promise<MatchAction> {
    return await MatchAction.create({
      match_id: matchId,
      player_id: userId,
      turn_number: turnNumber,
      action_type: 'attack',
      action_data: JSON.stringify({
        attacker_card_id: attackerCardId,
        defender_card_id: defenderCardId,
        damage,
        hit
      })
    });
  }
}
