import express from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import {
  getRecentMessages,
  getUserMessages,
  deleteMessage
} from '../controllers/chat.controller';

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(authenticateToken);

// Obtener mensajes recientes del chat global
router.get('/messages', getRecentMessages);

// Obtener mensajes privados del usuario
router.get('/private', getUserMessages);

// Eliminar mensaje (solo propio)
router.delete('/messages/:message_id', deleteMessage);

export default router;
