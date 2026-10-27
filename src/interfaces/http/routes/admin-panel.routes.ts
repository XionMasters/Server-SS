import { Router } from 'express';
import path from 'path';

// Página estática del panel admin, montada en /admin.
// Se resuelve desde la raíz del proyecto para funcionar igual con ts-node (src/)
// y con el build (dist/), que no copia src/views.
const VIEWS_DIR = path.resolve(__dirname, '../../../../src/views');

const router = Router();

router.get('/admin.js', (_req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'admin.js'));
});
router.get('/style.css', (_req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'style.css'));
});
router.get('/', (_req, res) => {
  res.sendFile(path.join(VIEWS_DIR, 'admin.html'));
});

export default router;
