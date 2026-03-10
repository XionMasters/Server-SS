/**
 * KnightManager.ts
 *
 * OrquestaciÃ³n transaccional para las acciones de caballero.
 * Mismo patrÃ³n que TurnManager / AttackManager.
 *
 * Acciones:
 * - chargeKnightCosmos  â†’ +cosmos_per_charge CP al jugador (puro GameState)
 * - sacrificeKnight     â†’ -1 vida + mover carta a yomotsu
 * - moveKnight          â†’ mover carta a nueva posiciÃ³n (solo BD, sin GameState)
 * - useAbility          â†’ ejecuta habilidad activa de caballero
 *
 * PatrÃ³n transaccional unificado (runAction):
 *   idempotencia â†’ reload+lock â†’ mapear â†’ executor â†’ persist â†’ register
 */

import { sequelize } from '../../config/database';
import { KnightRulesEngine } from '../../engine/KnightRulesEngine';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { GameState } from '../../engine/GameState';
import CardInPlay from '../../models/CardInPlay';
import CardAbility from '../../models/CardAbility';
import { GameEventType, type GameEvent } from '../../engine/events/GameEvents';
import { parseAbilityDef } from '../../engine/abilities/AbilityDefinition';

// â”€â”€ Ability cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Las definiciones de habilidades son estÃ¡ticas durante la vida del proceso.
// Cacheamos por card_id para evitar N+1 queries a card_abilities.
// El cache se descarta en reinicio (suficiente para un servidor de juego).
const abilityCache = new Map<string, any[]>();

async function getAbilities(cardId: string, tx: any): Promise<any[]> {
  if (abilityCache.has(cardId)) return abilityCache.get(cardId)!;
  const records = await CardAbility.findAll({ where: { card_id: cardId }, transaction: tx });
  abilityCache.set(cardId, records);
  return records;
}

export class KnightManager {
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // GENERIC TRANSACTION RUNNER
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * PatrÃ³n de transacciÃ³n unificado que elimina ~200 lÃ­neas de boilerplate.
   *
   * Responsabilidades del helper:
   *   1. Idempotencia â€” devuelve resultado previo si actionId ya fue procesado
   *   2. TransacciÃ³n con lock de fila en el match
   *   3. Mapeo match â†’ GameState puro
   *   4. Persiste newState y registra el actionId
   *   5. Captura errores y devuelve { success: false }
   *
   * El executor recibe (state, tx) y lanza Error para abortar la transacciÃ³n.
   */
  private static async runAction<T extends { newState: GameState }>(
    match: any,
    playerNumber: 1 | 2,
    actionId: string,
    actionName: string,
    executor: (state: GameState, tx: any) => Promise<T>,
  ): Promise<any> {
    try {
      // 0ï¸âƒ£ IDEMPOTENCIA
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[KnightManager] ${actionName} ${actionId} ya procesada (retry)`);
        return { success: true, newState: cached.cached_result, isRetry: true };
      }

      // 1ï¸âƒ£ TRANSACCIÃ“N CON LOCK
      const result = await sequelize.transaction(async (tx) => {
        await match.reload({ lock: tx.LOCK.UPDATE, transaction: tx });
        // Cargar cartas en juego con lock para que MatchStateMapper pueble
        // field_knights y el sweep de yomotsu en applyState sea correcto.
        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id: match.id },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        (match as any).cards_in_play = cardsInPlay;
        const state = MatchStateMapper.fromMatch(match);
        const execResult = await executor(state, tx);
        await MatchRepository.applyState(match, execResult.newState, tx);
        await ProcessedActionsRegistry.register(
          actionId, match.id, playerNumber, execResult.newState, actionName, tx,
        );
        return execResult;
      });

      return { success: true, ...result };
    } catch (error) {
      console.error(`[KnightManager] Error en ${actionName}:`, error);
      return {
        success: false,
        newState: null,
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CHARGE_COSMOS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Cargar Cosmo: otorga cosmos_per_charge CP al jugador (segÃºn BASE_MATCH_RULES).
   */
  static async chargeKnightCosmos(
    match: any,
    playerNumber: 1 | 2,
    actionId: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    cosmosGained: number;
    error?: string;
    isRetry?: boolean;
  }> {
    const result = await this.runAction(
      match, playerNumber, actionId, 'charge_cosmos',
      async (state) => {
        const v = KnightRulesEngine.validateChargeKnightCosmos(state, playerNumber);
        if (!v.valid) throw new Error(v.error ?? 'ValidaciÃ³n fallida');
        return KnightRulesEngine.chargeKnightCosmos(state, playerNumber);
      },
    );
    return { cosmosGained: 0, ...result };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SACRIFICE_KNIGHT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Sacrificar Caballero: -1 vida al jugador y mueve la carta al yomotsu.
   */
  static async sacrificeKnight(
    match: any,
    playerNumber: 1 | 2,
    cardInPlayId: string,
    actionId: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    lifeLost: number;
    error?: string;
    isRetry?: boolean;
  }> {
    const result = await this.runAction(
      match, playerNumber, actionId, 'sacrifice_knight',
      async (state, tx) => {
        const v = KnightRulesEngine.validateSacrificeKnight(state, playerNumber);
        if (!v.valid) throw new Error(v.error ?? 'ValidaciÃ³n fallida');

        const card = await CardInPlay.findOne({
          where: { id: cardInPlayId, match_id: match.id, player_number: playerNumber, zone: 'field_knight' },
          transaction: tx,
        });
        if (!card) throw new Error('Carta de caballero no encontrada en campo del jugador');

        const execution = KnightRulesEngine.sacrificeKnight(state, playerNumber);
        await card.update({ zone: 'yomotsu', position: 0 }, { transaction: tx });
        return execution;
      },
    );
    return { lifeLost: 1, ...result };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // MOVE_KNIGHT
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Mover Caballero: cambia la posiciÃ³n de un caballero en el campo (0â€“4).
   * No hay cambio en GameState puro (posiciones no se trackean ahÃ­).
   */
  static async moveKnight(
    match: any,
    playerNumber: 1 | 2,
    cardInPlayId: string,
    targetPosition: number,
    actionId: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    oldPosition: number;
    newPosition: number;
    error?: string;
    isRetry?: boolean;
  }> {
    const result = await this.runAction(
      match, playerNumber, actionId, 'move_knight',
      async (state, tx) => {
        const v = KnightRulesEngine.validateTurn(state, playerNumber);
        if (!v.valid) throw new Error(v.error ?? 'ValidaciÃ³n fallida');
        if (targetPosition < 0 || targetPosition > 4)
          throw new Error('PosiciÃ³n de destino invÃ¡lida (0â€“4)');

        const card = await CardInPlay.findOne({
          where: { id: cardInPlayId, match_id: match.id, player_number: playerNumber, zone: 'field_knight' },
          transaction: tx,
        });
        if (!card) throw new Error('Carta de caballero no encontrada en campo del jugador');

        const occupied = await CardInPlay.findOne({
          where: { match_id: match.id, player_number: playerNumber, zone: 'field_knight', position: targetPosition },
          transaction: tx,
        });
        if (occupied) throw new Error('La posiciÃ³n destino ya estÃ¡ ocupada');

        const oldPosition = card.position as number;
        await card.update({ position: targetPosition }, { transaction: tx });

        // moveKnight no modifica GameState puro; devuelve el estado actual sin cambios
        return { newState: state, oldPosition, newPosition: targetPosition };
      },
    );
    return { oldPosition: -1, newPosition: targetPosition, ...result };
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // USE_ABILITY
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

  /**
   * Usa una habilidad activa de un caballero.
   * Persiste cosmos, status_effects y posible descarte desde la mano.
   */
  static async useAbility(
    match: any,
    playerNumber: 1 | 2,
    cardInPlayId: string,
    abilityName: string,
    actionId: string,
    targetId?: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    error?: string;
    isRetry?: boolean;
    extras?: Record<string, any>;
  }> {
    return this.runAction(
      match, playerNumber, actionId, 'use_ability',
      async (state, tx) => {
        // â”€â”€ Cargar cartas con lock â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id: match.id },
          transaction: tx,
          lock: tx.LOCK.UPDATE,
        });
        (match as any).cards_in_play = cardsInPlay;

        // â”€â”€ O(1) index â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const cardMap = new Map<string, any>(cardsInPlay.map((c: any) => [c.id, c]));

        const casterRecord = cardMap.get(cardInPlayId);
        if (!casterRecord) throw new Error('Carta lanzadora no encontrada en la partida');

        // â”€â”€ Cargar definiciÃ³n de habilidad (con cache) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const abilityRecords = await getAbilities(casterRecord.card_id, tx);

        // Preferir ability_key si estÃ¡ disponible; fallback a normalizaciÃ³n de nombre
        const abilityRecord = abilityRecords.find((a: any) =>
          (a.ability_key ?? a.name.toLowerCase().replace(/\s+/g, '_')) === abilityName,
        );
        if (!abilityRecord)
          throw new Error(`Habilidad "${abilityName}" no encontrada en la carta`);

        const abilityDef = parseAbilityDef(abilityRecord.effects);
        if (!abilityDef)
          throw new Error(`DefiniciÃ³n invÃ¡lida para la habilidad "${abilityName}"`);

        // â”€â”€ Validar objetivo si se provee â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (targetId) {
          const targetRecord = cardMap.get(targetId);
          if (!targetRecord || targetRecord.zone !== 'field_knight')
            throw new Error('Carta objetivo no vÃ¡lida o no estÃ¡ en el campo (field_knight)');
        }

        // â”€â”€ Construir evento â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const gameEvent: GameEvent = {
          type:         GameEventType.ACTIVE,
          playerNumber,
          sourceCardId: cardInPlayId,
          targetCardId: targetId,
        };

        // â”€â”€ Validar & ejecutar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const validation = KnightRulesEngine.validateUseAbility(
          state, playerNumber, cardInPlayId, abilityDef, gameEvent,
        );
        if (!validation.valid) throw new Error(validation.error ?? 'ValidaciÃ³n fallida');

        const execution = KnightRulesEngine.useAbility(
          state, playerNumber, cardInPlayId, abilityDef, gameEvent,
        );

        // â”€â”€ Persistir status_effects con O(1) cardMap â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const allPlayers = [execution.newState.player1, execution.newState.player2];
        for (const affectedId of execution.affectedIds) {
          let updatedCard: any;
          for (const p of allPlayers) {
            updatedCard = p.field_knights.find((c: any) => c.instance_id === affectedId);
            if (updatedCard) break;
          }
          if (!updatedCard) continue;

          const record = cardMap.get(affectedId);
          if (!record) continue;

          await record.update(
            {
              // Columna JSONB â€” pasar el objeto directamente, sin JSON.stringify
              status_effects: updatedCard.status_effects,
              current_cosmos: updatedCard.current_cosmos,
              ...(updatedCard.current_health !== undefined
                ? { current_health: updatedCard.current_health }
                : {}),
            },
            { transaction: tx },
          );
        }

        // â”€â”€ Descartar carta si la habilidad lo requiere â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Usamos CardInPlay.update directo para no fallar si la carta no estaba
        // pre-cargada (ej: filtrada desde mano).
        const discardCardId: string | undefined = execution.extras?.discard_card_id;
        if (discardCardId) {
          await CardInPlay.update(
            { zone: 'yomotsu' },
            { where: { id: discardCardId, match_id: match.id }, transaction: tx },
          );
        }

        return { newState: execution.newState, extras: execution.extras ?? {} };
      },
    );
  }
}
