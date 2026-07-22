import { Router } from 'express';
import {
  createDraft,
  updateDraft,
  submitEntry,
  approveEntry,
  rejectEntry,
  listPendingApproval,
} from '../controllers/entryApprovalController';

/**
 * Maker-checker approval tower (ADR-INCR-APPROVAL). Mounted at `/api/entry-approvals`
 * (routes/index.ts) — 2-touch registration: the mount plus
 * the OpenAPI doc blocks in docs.paths.ts. State
 * changes are COMMANDS, never a generic PATCH status (ACC-016). Static segments (`/pending`,
 * `/drafts`) are declared before the `/:id` routes so they are never captured as an id.
 */
const router = Router();

router.get('/pending', listPendingApproval);
router.post('/drafts', createDraft);
router.put('/drafts/:id', updateDraft);
router.post('/drafts/:id/submit', submitEntry);
router.post('/:id/approve', approveEntry);
router.post('/:id/reject', rejectEntry);

export default router;
