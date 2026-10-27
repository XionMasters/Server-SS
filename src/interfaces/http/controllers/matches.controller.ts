import { Request, Response } from 'express';
import { StartMatchService } from '../../../app/matches/lifecycle/startMatch.service';
import { matchesCoordinator } from '../../../app/matches/coordinators/matchesCoordinator';

export const getMatchState = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const result = await matchesCoordinator.getMatchState(id, user.id);

    if (!result.success) {
      return res.status((result as any).statusCode || 500).json({
        error: result.error || 'Error obteniendo estado de partida',
        code: (result as any).code || 'MATCH_STATE_ERROR'
      });
    }

    return res.json(result.data);
  } catch (error: any) {
    console.error('Error obteniendo estado de partida:', error);
    return res.status(500).json({ error: 'Error obteniendo estado de partida' });
  }
};

export const canSearchMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await matchesCoordinator.canSearchMatch(user.id, user.username);
    return res.json(result.data);
  } catch (error: any) {
    console.error('Error verificando si puede buscar partida:', error);
    return res.status(500).json({ error: 'Error verificando estado del mazo' });
  }
};

export const startTestMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await StartMatchService.createNewMatch(user.id, user.id, 'TEST');

    return res.json({
      success: true,
      match_id: result.match_id,
      message: 'Partida TEST iniciada',
      game_state: result.game_state
    });
  } catch (error: any) {
    console.error('Error en startTestMatch:', error);

    const isRateLimit = error.message?.includes('rate limit');
    return res.status(isRateLimit ? 429 : 400).json({
      error: error.message,
      code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : 'TEST_MATCH_ERROR'
    });
  }
};

export const resumeTestMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const result = await StartMatchService.resumeTestMatch(user.id);

    return res.json({
      success: true,
      match_id: result.match_id,
      message: 'Partida TEST reanudada',
      game_state: result.game_state
    });
  } catch (error: any) {
    console.error('Error en resumeTestMatch:', error);
    return res.status(400).json({ error: error.message, code: 'RESUME_TEST_MATCH_ERROR' });
  }
};

export const abandonMatch = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const result = await matchesCoordinator.abandonMatch(id, user.id);

    if (!result.success) {
      return res.status((result as any).statusCode || 400).json({
        error: result.error || 'Error abandonando partida',
        code: (result as any).code || 'ABANDON_ERROR'
      });
    }

    return res.json({
      success: true,
      message: result.message || 'Partida abandonada correctamente',
      match_id: result.match_id || id,
      winner_id: result.winner_id
    });
  } catch (error: any) {
    console.error('Error abandonando partida:', error.message);
    return res.status(400).json({ error: error.message, code: 'ABANDON_ERROR' });
  }
};
