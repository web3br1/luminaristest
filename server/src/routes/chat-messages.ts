import { Router } from 'express';
import { listMessages, createMessage } from '@/controllers/chatMessagesController';

const router = Router();

router.get('/', listMessages);
router.post('/', createMessage);

export default router;
