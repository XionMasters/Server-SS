// src/routes/auth.routes.ts
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
import { validateSession } from '../middleware/validateSession';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticateToken, validateSession, logout);
router.get('/profile', authenticateToken, validateSession, getProfile);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerificationEmail);

export default router;