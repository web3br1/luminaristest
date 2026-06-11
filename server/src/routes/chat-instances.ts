import { Router } from 'express';
import { listChatInstances, createChatInstance, updateChatInstance, deleteChatInstance, getOrCreateChatInstance } from '@/controllers/chatInstancesController';

const router = Router();

router.get('/', listChatInstances);
router.post('/', createChatInstance);
router.post('/get-or-create', getOrCreateChatInstance);
router.put('/:id', updateChatInstance);
router.delete('/:id', deleteChatInstance);

export default router;

