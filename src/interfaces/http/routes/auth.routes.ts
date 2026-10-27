// src/interfaces/http/routes/auth.routes.ts
import { Router } from 'express';
import { 
  register, 
  login, 
  logout,
  getProfile, 
  verifyEmail, 
  resendVerificationEmail 
} from '../controllers/auth.controller';
import { authenticateToken } from '../middleware/auth.middleware';
import { authRateLimit } from '../middleware/rate-limit.middleware';

const router = Router();

router.post('/register', authRateLimit, register);
router.post('/login', authRateLimit, login);
router.post('/logout', authenticateToken, logout);
router.get('/profile', authenticateToken, getProfile);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', authRateLimit, resendVerificationEmail);

export default router;