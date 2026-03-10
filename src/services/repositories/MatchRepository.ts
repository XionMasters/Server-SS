/**
 * MatchRepository.ts
 * 
 * Abstracción de persistencia para Match.
 * ÚNICA capa que escribe en BD.
 * 
 * Responsabilidades:
 * ✅ Aplicar cambios de GameState → Match
 * ✅ Guardar en BD dentro de transacción
 * ✅ Manejar errores de BD
 * 
 * ❌ NO hace lógica de negocio
 * ❌ NO valida reglas
 * ❌ NO hace queries complejas
 * 
 * Patrón Repository: Abstrae acceso a datos
 */

import { GameState } from '../../engine/GameState';
import { MatchStateMapper } from '../mappers/MatchStateMapper';
import Match from '../../models/Match';
import CardInPlay from '../../models/CardInPlay';
import { Op } from 'sequelize';

/** Zonas de campo activas (las que se comparan contra el GameState) */
const ACTIVE_FIELD_ZONES = ['field_knight', 'field_support', 'field_helper'] as const;

export class MatchRepository {
  /**
   * Aplica cambios de estado puro a Match y guarda en BD
   * 
   * CRÍTICO: Solo llama a match.save(), no hace queries nuevas.
   * Los cambios en GameState ya fueron validados y ejecutados.
   * Solo hay que reflejarlos en el modelo.
   * 
   * @param match Match model (Sequelize)
   * @param newState GameState actualizado
   * @param transaction Transacción Sequelize (para atomicidad)
   */
  static async applyState(match: Match, newState: GameState, transaction: any) {
    try {
      // 1️⃣ Obtener updates desde el estado puro
      const updates = MatchStateMapper.getUpdatesFromState(newState);

      // 2️⃣ Aplicar updates al modelo Match
      Object.assign(match, updates);

      // 3️⃣ Guardar en BD (dentro de la transacción)
      await match.save({ transaction });

      // 4️⃣ Persistir estado de cartas (is_exhausted, attacked_this_turn, mode, health)
      const allCards = [
        ...newState.player1.field_knights,
        ...newState.player1.field_techniques,
        ...newState.player1.hand,
        ...newState.player2.field_knights,
        ...newState.player2.field_techniques,
        ...newState.player2.hand,
      ];
      if (newState.player1.field_helper) allCards.push(newState.player1.field_helper);
      if (newState.player2.field_helper) allCards.push(newState.player2.field_helper);

      for (const card of allCards) {
        await CardInPlay.update(
          {
            has_attacked_this_turn: card.attacked_this_turn,
            can_attack_this_turn: !card.is_exhausted,
            // is_defensive_mode sincronizado desde status_effects (fuente de verdad)
            is_defensive_mode: card.mode ?? 'normal',
            // status_effects persistido como JSON (fuente de verdad para modo y boosts)
            status_effects: JSON.stringify(card.status_effects ?? []),
            // Guardar stats resultado de boosts activos
            current_health: card.current_health,
            current_attack: card.ce,
            current_defense: card.ar,
            current_cosmos: card.current_cosmos,
          },
          { where: { id: card.instance_id }, transaction }
        );
      }

      // 5️⃣ Mover al yomotsu las cartas que ya no están en ningún campo del GameState
      //    (murieron en combate esta acción)
      const liveInstanceIds = new Set(
        allCards.map(c => c.instance_id)
      );

      const moved = await CardInPlay.update(
        { zone: 'yomotsu' },
        {
          where: {
            match_id: match.id,
            zone: { [Op.in]: [...ACTIVE_FIELD_ZONES] },
            id: { [Op.notIn]: [...liveInstanceIds] },
          },
          transaction,
        }
      );

      if (moved[0] > 0) {
        console.log(`⚰️  [MatchRepository] ${moved[0]} carta(s) movida(s) al yomotsu (match: ${match.id})`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error en MatchRepository.applyState:', error);
      throw error; // La transacción se rollback automáticamente
    }
  }

  /**
   * Obtener Match por ID (lectura)
   */
  static async findById(matchId: string): Promise<Match | null> {
    try {
      return await Match.findByPk(matchId);
    } catch (error) {
      console.error('Error en MatchRepository.findById:', error);
      return null;
    }
  }

  /**
   * Actualizar solo campos específicos (útil para operaciones atómicas)
   */
  static async update(matchId: string, updates: Partial<Match>, transaction?: any) {
    try {
      const match = await this.findById(matchId);
      if (!match) {
        return { success: false, error: 'Match no encontrado' };
      }

      Object.assign(match, updates);
      await match.save({ transaction });

      return { success: true, match };
    } catch (error) {
      console.error('Error en MatchRepository.update:', error);
      throw error;
    }
  }
}
