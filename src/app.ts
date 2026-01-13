// src/app.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import cardRoutes from './routes/cards.routes';
import userCardsRoutes from './routes/userCards.routes';
import packsRoutes from './routes/packs.routes';
import transactionsRoutes from './routes/transactions.routes';
import decksRoutes from './routes/decks.routes';
import matchesRoutes from './routes/matches.routes';
import adminRoutes from './routes/admin.routes';
import profileRoutes from './routes/profile.routes';
import chatRoutes from './routes/chat.routes';
import combatRoutes from './routes/combat.routes';

dotenv.config();

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos (imágenes de cartas)
app.use('/assets', express.static(path.join(__dirname, '../src/assets')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/user-cards', userCardsRoutes);
app.use('/api/packs', packsRoutes);
app.use('/api/transactions', transactionsRoutes);
app.use('/api/decks', decksRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/combat', combatRoutes);
app.use('/admin', adminRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Caballeros Cósmicos API'
  });
});

// ✅ CORRECCIÓN: Manejador 404 sin parámetro de ruta
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', error);
  res.status(500).json({ error: 'Error interno del servidor' });
});

export default app;