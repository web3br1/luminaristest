import { Router } from 'express';
import { register, login } from '../controllers/authController';
import { me, logout } from '@/controllers/authUtilityController';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', me);
router.post('/logout', logout);

export default router;

