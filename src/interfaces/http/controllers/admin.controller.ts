import { Request, Response } from 'express';
import { loginAdmin } from '../../../app/admin/admin-auth.use-case';
import { CardAdminError, CardAdminUseCases } from '../../../app/admin/card-admin';
import { buildMatchInspection, toActiveMatchSummary } from '../../../app/admin/match-inspection';
import { invalidateCardDefinition } from '../../../infrastructure/cache/card-definition.cache';
import { SequelizeAdminMatchRepository } from '../../../infrastructure/database/repositories/SequelizeAdminMatchRepository';
import { SequelizeCardAdminRepository } from '../../../infrastructure/database/repositories/SequelizeCardAdminRepository';
import { ActionResolver } from '../../../app/matches/actions/ActionResolver';

const ACTIVE_MATCHES_LIMIT = 50;
const DEFAULT_CARD_LIMIT = 50;

const matchRepository = new SequelizeAdminMatchRepository();
const cardAdmin = new CardAdminUseCases(new SequelizeCardAdminRepository(), invalidateCardDefinition);

const queryString = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const queryInt = (value: unknown): number | undefined => {
  const parsed = parseInt(queryString(value) ?? '', 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

// Errores de dominio conocidos → su status; el resto → 500 genérico sin detalles internos
const sendCardError = (res: Response, err: unknown, fallbackMessage: string, logLabel: string) => {
  if (err instanceof CardAdminError) {
    res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
    return;
  }
  console.error(`[Admin] ${logLabel}:`, err);
  res.status(500).json({ error: fallbackMessage });
};

export const authenticateAdmin = (req: Request, res: Response): void => {
  try {
    const token = loginAdmin(req.body?.password);
    if (!token) {
      res.status(401).json({ error: 'Contraseña incorrecta' });
      return;
    }
    res.json({ token, message: 'Autenticación exitosa' });
  } catch (error) {
    console.error('Error en autenticación admin:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
};

export const listActiveMatches = async (_req: Request, res: Response): Promise<void> => {
  try {
    const matches = await matchRepository.findActiveMatches(ACTIVE_MATCHES_LIMIT);
    res.json(matches.map(toActiveMatchSummary));
  } catch (err) {
    console.error('[Admin] Error listing matches:', err);
    res.status(500).json({ error: 'Error al listar partidas' });
  }
};

export const inspectMatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const match = await matchRepository.findMatchForInspection(req.params.id as string);
    if (!match) { res.status(404).json({ error: 'Partida no encontrada' }); return; }

    res.json(buildMatchInspection(match, (cards, state) => ActionResolver.resolve(cards, state)));
  } catch (err) {
    console.error('[Admin] Error inspecting match:', err);
    res.status(500).json({ error: 'Error al obtener partida' });
  }
};

export const listCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await cardAdmin.listCards(
      {
        type: queryString(req.query.type),
        rarity: queryString(req.query.rarity),
        element: queryString(req.query.element),
        faction: queryString(req.query.faction),
        search: queryString(req.query.search),
        costMin: queryInt(req.query.cost_min),
        costMax: queryInt(req.query.cost_max),
      },
      queryInt(req.query.limit) ?? DEFAULT_CARD_LIMIT,
      queryInt(req.query.offset) ?? 0
    );
    res.json(result);
  } catch (err) {
    console.error('[Admin] Error listing cards:', err);
    res.status(500).json({ error: 'Error al listar cartas' });
  }
};

export const getCard = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await cardAdmin.getCard(req.params.cardId as string));
  } catch (err) {
    sendCardError(res, err, 'Error al obtener carta', 'Error fetching card');
  }
};

export const createCard = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(201).json(await cardAdmin.createCard(req.body ?? {}));
  } catch (err) {
    sendCardError(res, err, 'Error al crear carta', 'Error creating card');
  }
};

export const updateCard = async (req: Request, res: Response): Promise<void> => {
  try {
    res.json(await cardAdmin.updateCard(req.params.cardId as string, req.body ?? {}));
  } catch (err) {
    sendCardError(res, err, 'Error al actualizar carta', 'Error updating card');
  }
};

export const deleteCard = async (req: Request, res: Response): Promise<void> => {
  try {
    await cardAdmin.deleteCard(req.params.cardId as string);
    res.json({ success: true });
  } catch (err) {
    sendCardError(res, err, 'Error al eliminar carta', 'Error deleting card');
  }
};
