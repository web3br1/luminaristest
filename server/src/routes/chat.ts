import { Router } from 'express';
import { postChat } from '@/controllers/chatController';

const router = Router();

router.post('/', postChat);

export default router;
