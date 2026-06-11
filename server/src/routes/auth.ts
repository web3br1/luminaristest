import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login } from '../controllers/authController';
import { me, logout } from '@/controllers/authUtilityController';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 1 minute before trying again.' },
});

router.post('/register', register);
router.post('/login', loginLimiter, login);
router.get('/me', me);
router.post('/logout', logout);

export default router;

