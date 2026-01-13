import { Router, Request, Response } from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';

const router = Router();

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

export default router;
