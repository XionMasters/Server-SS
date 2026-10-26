import { sequelize } from '../../config/database';
import CardInPlay from '../../models/CardInPlay';
import Card from '../../models/Card';
import CardTechnique from '../../models/CardTechnique';
import { GameState } from '../../engine/GameState';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import { MatchRepository } from '../repositories/MatchRepository';
import { ProcessedActionsRegistry } from '../registries/ProcessedActionsRegistry';
import { TechniqueRulesEngine, TechniqueStats } from '../../engine/TechniqueRulesEngine';
import type { GameEvent } from '../../engine/events/GameEvents';

export class TechniqueManager {
  static async techniqueAttack(
    match: any,
    playerNumber: 1 | 2,
    knightCardId: string,
    techniqueCardId: string,
    defenderCardId: string | null,
    actionId: string,
  ): Promise<{
    success: boolean;
    newState: GameState | null;
    totalDamage: number;
    hitCount: number;
    events: GameEvent[];
    error?: string;
    isRetry?: boolean;
  }> {
    try {
      // 0️⃣ IDEMPOTENCIA CHECK
      const cached = await ProcessedActionsRegistry.find(actionId);
      if (cached) {
        console.log(`[TechniqueManager] Acción ${actionId} ya procesada (retry)`);
        const cachedResult = (cached as any).cached_result ?? {};
        const cachedState = cachedResult.newState ?? cachedResult;
        return {
          success: true,
          newState: cachedState,
          totalDamage: cachedResult.totalDamage ?? 0,
          hitCount: cachedResult.hitCount ?? 0,
          events: [],
          isRetry: true,
        };
      }

      // 1️⃣ TRANSACCIÓN CON LOCK
      const result = await sequelize.transaction(async (transaction) => {
        // 2️⃣ LOCK DE FILA
        await match.reload({ lock: transaction.LOCK.UPDATE, transaction });

        const cardsInPlay = await CardInPlay.findAll({
          where: { match_id: match.id },
          include: [{
            model: Card,
            as: 'card',
            include: [{ model: CardTechnique, as: 'card_technique' }],
          }],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
        (match as any).cards_in_play = cardsInPlay;

        // 3️⃣ MAPEAR A ESTADO PURO
        const currentState = MatchStateMapper.fromMatch(match);

        // Resolver técnica en cards_in_play para obtener card_id y stats
        const techniqueInPlay = cardsInPlay.find(c => c.id === techniqueCardId);
        if (!techniqueInPlay) throw new Error('Técnica no encontrada en cards_in_play');

        const techniqueCard: any = (techniqueInPlay as any).card;
        const ts: any = techniqueCard?.card_technique;
        if (!ts) throw new Error('La carta técnica no tiene card_technique configurado');

        const stats: TechniqueStats = {
          hit_count: Number(ts.hit_count ?? 1),
          hit_ce: Number(ts.hit_ce ?? 0),
          ta_cost: Number(ts.ta_cost ?? 0),
          compatible_tags: Array.isArray(ts.compatible_tags) ? ts.compatible_tags : [],
          ignore_ar: ts.ignore_ar === true,
          ta_effects: Array.isArray(ts.ta_effects) ? ts.ta_effects : [],
        };

        // 4️⃣ VALIDAR
        const validation = TechniqueRulesEngine.validateTechniqueAttack(
          currentState,
          playerNumber,
          knightCardId,
          techniqueCardId,
          defenderCardId,
          stats,
        );
        if (!validation.valid) {
          throw new Error(validation.error || 'Validación TA fallida');
        }

        // 5️⃣ EJECUTAR
        const execution = TechniqueRulesEngine.techniqueAttack(
          currentState,
          playerNumber,
          knightCardId,
          techniqueCardId,
          defenderCardId,
          stats,
        );

        // 6️⃣ PERSISTIR
        await MatchRepository.applyState(match, execution.newState, transaction);

        // 7️⃣ REGISTRAR
        const cacheData = {
          newState: execution.newState,
          totalDamage: execution.totalDamage,
          hitCount: execution.hitCount,
        };

        await ProcessedActionsRegistry.register(
          actionId,
          match.id,
          playerNumber,
          cacheData,
          'technique_attack',
          transaction,
        );

        return {
          newState: execution.newState,
          totalDamage: execution.totalDamage,
          hitCount: execution.hitCount,
          events: execution.events,
        };
      });

      return {
        success: true,
        newState: result.newState,
        totalDamage: result.totalDamage,
        hitCount: result.hitCount,
        events: result.events,
      };
    } catch (error) {
      console.error('[TechniqueManager] Error en techniqueAttack:', error);
      return {
        success: false,
        newState: null,
        totalDamage: 0,
        hitCount: 0,
        events: [],
        error: error instanceof Error ? error.message : 'Error desconocido',
      };
    }
  }
}
