import { Router } from 'express';
import { getUsers, getUserById, createUser, updateUser, deleteUser, updateMyPreferences } from '../controllers/userController';

const router = Router();

router.get('/', getUsers);
router.get('/:id', getUserById);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);
router.patch('/me/preferences', updateMyPreferences);

export default router;
