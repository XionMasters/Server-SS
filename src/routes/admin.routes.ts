import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { Match, CardInPlay, Card, User, CardKnight } from '../models/associations';
import { ActionResolver } from '../services/game/ActionResolver';

const router = Router();

// =============================================
// Middleware de autenticación admin
// =============================================
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Token requerido' }); return; }
  try {
    const payload: any = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    if (payload.role !== 'admin') { res.status(403).json({ error: 'Acceso denegado' }); return; }
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

// Servir archivos estáticos del admin
router.get('/admin.js', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../views/admin.js'));
});

// Servir la página HTML del dashboard
router.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../views/admin.html'));
});

// Autenticación del admin
router.post('/auth', (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Generar token JWT para admin
    const token = jwt.sign(
      { role: 'admin' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({ token, message: 'Autenticación exitosa' });
  } catch (error) {
    console.error('Error en autenticación admin:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// =============================================
// Match Inspector API
// =============================================

// Lista de partidas activas (no finished)
router.get('/matches', requireAdmin, async (req: Request, res: Response) => {
  try {
    const matches = await Match.findAll({
      where: { phase: { [Op.ne]: 'finished' } },
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] },
      ],
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json(matches.map((m: any) => ({
      id: m.id,
      phase: m.phase,
      current_turn: m.current_turn,
      current_player: m.current_player,
      player1: { id: m.player1_id, username: m.player1?.username || '?' },
      player2: { id: m.player2_id, username: m.player2?.username || '(vacío)' },
      player1_life: m.player1_life,
      player2_life: m.player2_life,
      player1_cosmos: m.player1_cosmos,
      player2_cosmos: m.player2_cosmos,
      created_at: (m as any).createdAt ?? (m as any).created_at ?? null,
    })));
  } catch (err) {
    console.error('[Admin] Error listing matches:', err);
    res.status(500).json({ error: 'Error al listar partidas' });
  }
});

// Detalle completo de una partida
router.get('/matches/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const match: any = await Match.findByPk(req.params.id, {
      include: [
        { model: User, as: 'player1', attributes: ['id', 'username'] },
        { model: User, as: 'player2', attributes: ['id', 'username'] },
        {
          model: CardInPlay,
          as: 'cards_in_play',
          include: [{
            model: Card,
            as: 'card',
            attributes: ['id', 'name', 'type', 'rarity', 'cost', 'element', 'faction', 'image_url'],
            include: [{ model: CardKnight, as: 'card_knight', attributes: ['attack', 'defense', 'health', 'cosmos'] }],
          }],
        },
      ],
    });

    if (!match) { res.status(404).json({ error: 'Partida no encontrada' }); return; }

    // Enriquecer cards_in_play con valid_actions usando ActionResolver (mismo que el cliente)
    // Admin: calculamos para AMBOS jugadores para tener visibilidad completa del campo.
    const rawCards = match.cards_in_play.map((c: any) => ({
      id: c.id,
      player_number: c.player_number,
      zone: c.zone,
      position: c.position,
      is_defensive_mode: c.is_defensive_mode,
      can_attack_this_turn: c.can_attack_this_turn,
      has_attacked_this_turn: c.has_attacked_this_turn,
      card: c.card ? { type: c.card.type, cost: c.card.cost, card_knight: c.card.card_knight } : undefined,
    }));
    const matchMeta = {
      player1_life: match.player1_life,
      player2_life: match.player2_life,
      player1_cosmos: match.player1_cosmos,
      player2_cosmos: match.player2_cosmos,
    };
    // Correr el resolver una vez por cada jugador como activo y fusionar
    const enrichedAsP1 = ActionResolver.resolve(rawCards, { ...matchMeta, current_player: 1 });
    const enrichedAsP2 = ActionResolver.resolve(rawCards, { ...matchMeta, current_player: 2 });
    const validActionsMap = new Map<string, any>();
    enrichedAsP1.forEach((c: any) => { if (c.valid_actions !== null) validActionsMap.set(c.id, c.valid_actions); });
    enrichedAsP2.forEach((c: any) => { if (c.valid_actions !== null) validActionsMap.set(c.id, c.valid_actions); });

    const zones = ['hand', 'field_knight', 'field_support', 'field_helper', 'yomotsu', 'cositos', 'deck'];
    const buildZones = (playerNum: number) => {
      const result: Record<string, any[]> = {};
      for (const zone of zones) {
        result[zone] = match.cards_in_play
          .filter((c: any) => c.player_number === playerNum && c.zone === zone)
          .sort((a: any, b: any) => a.position - b.position)
          .map((c: any) => ({
            instance_id: c.id,
            card_id: c.card_id,
            position: c.position,
            mode: c.is_defensive_mode,
            is_exhausted: c.has_attacked_this_turn || !c.can_attack_this_turn,
            can_attack: c.can_attack_this_turn,
            has_attacked: c.has_attacked_this_turn,
            status_effects: (() => { try { return JSON.parse(c.status_effects || '[]'); } catch { return []; } })(),
            valid_actions: validActionsMap.get(c.id) ?? null,
            atk: c.current_attack,
            def: c.current_defense,
            hp: c.current_health,
            name: c.card?.name || '?',
            type: c.card?.type || '?',
            rarity: c.card?.rarity || '?',
            cost: c.card?.cost ?? '?',
            element: c.card?.element || '',
            image_url: c.card?.image_url || '',
            knight: c.card?.card_knight
              ? { ce: c.card.card_knight.cosmos, ar: c.card.card_knight.defense, hp: c.card.card_knight.health, atk: c.card.card_knight.attack }
              : null,
          }));
      }
      return result;
    };

    // Contar cartas en el mazo desde deck_order vs deck_index
    const p1DeckSize = match.player1_deck_order
      ? Math.max(0, JSON.parse(match.player1_deck_order).length - (match.player1_deck_index ?? 0))
      : match.cards_in_play.filter((c: any) => c.player_number === 1 && c.zone === 'deck').length;
    const p2DeckSize = match.player2_deck_order
      ? Math.max(0, JSON.parse(match.player2_deck_order).length - (match.player2_deck_index ?? 0))
      : match.cards_in_play.filter((c: any) => c.player_number === 2 && c.zone === 'deck').length;

    res.json({
      id: match.id,
      phase: match.phase,
      current_turn: match.current_turn,
      current_player: match.current_player,
      created_at: (match as any).createdAt ?? (match as any).created_at ?? null,
      player1: {
        id: match.player1_id,
        username: match.player1?.username || '?',
        life: match.player1_life,
        cosmos: match.player1_cosmos,
        deck_remaining: p1DeckSize,
        deck_index: match.player1_deck_index ?? 0,
      },
      player2: {
        id: match.player2_id,
        username: match.player2?.username || '?',
        life: match.player2_life,
        cosmos: match.player2_cosmos,
        deck_remaining: p2DeckSize,
        deck_index: match.player2_deck_index ?? 0,
      },
      zones: {
        player1: buildZones(1),
        player2: buildZones(2),
      },
    });
  } catch (err) {
    console.error('[Admin] Error inspecting match:', err);
    res.status(500).json({ error: 'Error al obtener partida' });
  }
});

export default router;
