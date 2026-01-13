// src/controllers/combat.controller.ts
import { Request, Response } from 'express';
import Match from '../models/Match';
import CardInPlay from '../models/CardInPlay';
import CardKnight from '../models/CardKnight';
import { broadcastMatchUpdate } from '../services/websocket.service';

/**
 * Calcular daño según el modo de combate
 */
function calculateDamage(attackerCE: number, defenderAR: number, attackMode: 'normal' | 'block' | 'evade', isTechnique: boolean = false): {
  damage: number;
  evaded: boolean;
  calculation: string;
} {
  let damage = 0;
  let evaded = false;
  let calculation = '';

  switch (attackMode) {
    case 'normal':
      damage = Math.max(1, attackerCE - defenderAR);
      calculation = `${attackerCE} (CE) - ${defenderAR} (AR) = ${damage}`;
      break;

    case 'block':
      const halfCE = Math.floor(attackerCE / 2);
      damage = Math.max(0, halfCE - defenderAR);
      calculation = `(${attackerCE} CE / 2) - ${defenderAR} AR = ${damage}`;
      break;

    case 'evade':
      // Solo BA (ataques básicos) pueden ser evadidos
      if (isTechnique) {
        damage = Math.max(1, attackerCE - defenderAR);
        calculation = `${attackerCE} (CE) - ${defenderAR} (AR) = ${damage} (Técnica ignora evasión)`;
      } else {
        // Coin flip: 50% de evadir
        const coinFlip = Math.random() < 0.5;
        if (coinFlip) {
          damage = 0;
          evaded = true;
          calculation = 'EVADIDO! (Coin flip: Tails)';
        } else {
          damage = Math.max(1, attackerCE - defenderAR);
          calculation = `${attackerCE} (CE) - ${defenderAR} (AR) = ${damage} (Coin flip: Heads)`;
        }
      }
      break;
  }

  return { damage, evaded, calculation };
}

/**
 * Ejecutar ataque básico (BA)
 */
export const executeBasicAttack = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { match_id, attacker_card_id, defender_card_id } = req.body;

    // Validar campos requeridos
    if (!match_id || !attacker_card_id || !defender_card_id) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    // Buscar partida
    const match = await Match.findByPk(match_id);
    if (!match) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    // Verificar que es el turno del jugador
    const playerNumber = match.player1_id === user.id ? 1 : 2;
    if (match.current_player !== playerNumber) {
      return res.status(400).json({ error: 'No es tu turno' });
    }

    // Buscar cartas atacante y defensor
    const attackerCard = await CardInPlay.findOne({
      where: { id: attacker_card_id, match_id },
      include: [{ model: CardKnight, as: 'knight' }]
    });

    const defenderCard = await CardInPlay.findOne({
      where: { id: defender_card_id, match_id },
      include: [{ model: CardKnight, as: 'knight' }]
    });

    if (!attackerCard || !defenderCard) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }

    // Validar que el atacante es del jugador y el defensor del oponente
    if (attackerCard.player_number !== playerNumber || defenderCard.player_number === playerNumber) {
      return res.status(400).json({ error: 'Cartas inválidas para combate' });
    }

    // Obtener stats
    const attackerCE = (attackerCard as any).knight?.ce || 0;
    const defenderAR = (defenderCard as any).knight?.ar || 0;
    const defenderMode = defenderCard.is_defensive_mode ? 'block' : 'normal';

    // Calcular daño
    const result = calculateDamage(attackerCE, defenderAR, defenderMode, false);

    // Aplicar daño al defensor
    const defenderHP = defenderCard.current_health;
    const newHP = Math.max(0, defenderHP - result.damage);

    // Actualizar HP del defensor
    await defenderCard.update({
      current_health: newHP
    });

    // Si HP llega a 0, mover carta al yomotsu (cementerio)
    if (newHP <= 0) {
      await defenderCard.update({
        zone: 'yomotsu',
        position: 0
      });
    }

    // Registrar resultado del combate
    const combatResult = {
      attacker_id: attacker_card_id,
      defender_id: defender_card_id,
      damage: result.damage,
      evaded: result.evaded,
      calculation: result.calculation,
      defender_destroyed: newHP <= 0
    };

    // Broadcast actualización
    await broadcastMatchUpdate(match_id);

    return res.json({
      success: true,
      combat_result: combatResult
    });

  } catch (error) {
    console.error('Error en ataque básico:', error);
    return res.status(500).json({ error: 'Error ejecutando ataque' });
  }
};

/**
 * Ejecutar carga de cosmos
 */
export const executeChargeKnightAction = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { match_id, card_id, action, target_position } = req.body;

    if (!match_id || !card_id || !action) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }

    const match = await Match.findByPk(match_id);
    if (!match) {
      return res.status(404).json({ error: 'Partida no encontrada' });
    }

    const playerNumber = match.player1_id === user.id ? 1 : 2;
    if (match.current_player !== playerNumber) {
      return res.status(400).json({ error: 'No es tu turno' });
    }

    const card = await CardInPlay.findOne({
      where: { id: card_id, match_id, player_number: playerNumber }
    });

    if (!card) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }

    let result: any = {};

    switch (action) {
      case 'charge':
        // Cargar Cosmo: +3 CP
        const currentCosmos = playerNumber === 1 ? match.player1_cosmos : match.player2_cosmos;
        const newCosmos = currentCosmos + 3;

        if (playerNumber === 1) {
          await match.update({ player1_cosmos: newCosmos });
        } else {
          await match.update({ player2_cosmos: newCosmos });
        }

        result = { cosmos_gained: 3, new_cosmos: newCosmos };
        break;

      case 'evade':
        // Activar modo evasión (guardamos en status_effects como JSON)
        const evadeEffects = JSON.parse(card.status_effects || '[]');
        evadeEffects.push({ type: 'evade', active: true });
        await card.update({
          status_effects: JSON.stringify(evadeEffects)
        });
        result = { mode: 'evade' };
        break;

      case 'block':
        // Activar modo bloqueo
        await card.update({
          is_defensive_mode: 'defense'
        });
        result = { mode: 'block' };
        break;

      case 'sacrifice':
        // Sacrificar caballero: -1 DLP (vida)
        const currentLife = playerNumber === 1 ? match.player1_life : match.player2_life;
        const newLife = Math.max(0, currentLife - 1);

        if (playerNumber === 1) {
          await match.update({ player1_life: newLife });
        } else {
          await match.update({ player2_life: newLife });
        }

        // Mover carta al yomotsu
        await card.update({
          zone: 'yomotsu',
          position: 0
        });

        result = { life_lost: 1, new_life: newLife };
        break;

      case 'move':
        // Mover caballero a nueva posición
        if (typeof target_position !== 'number' || target_position < 0 || target_position > 4) {
          return res.status(400).json({ error: 'Posición de destino inválida (0-4)' });
        }

        // Verificar que la posición destino esté vacía
        const existingCard = await CardInPlay.findOne({
          where: {
            match_id,
            player_number: playerNumber,
            zone: 'field_knight',
            position: target_position
          }
        });

        if (existingCard) {
          return res.status(400).json({ error: 'La posición destino ya está ocupada' });
        }

        const oldPosition = card.position;
        await card.update({
          position: target_position
        });

        result = { old_position: oldPosition, new_position: target_position };
        break;

      default:
        return res.status(400).json({ error: 'Acción no válida' });
    }

    // Broadcast actualización
    await broadcastMatchUpdate(match_id);

    return res.json({
      success: true,
      action,
      result
    });

  } catch (error) {
    console.error('Error en acción de caballero:', error);
    return res.status(500).json({ error: 'Error ejecutando acción' });
  }
};
