import { Router } from 'express';
import {
  listRoles,
  createRole,
  setRolePermissions,
  archiveRole,
  listAssignments,
  assignRole,
  revokeAssignment,
} from '../controllers/accessControlController';

/**
 * RBAC — roles/permissions/assignments (LGPD Fatia A / ADR-LGPD). Mounted at `/api/access-control`
 * (routes/index.ts). 3-touch registration: also add `/api/access-control` to `protectedApiPaths`
 * (middleware/auth.ts) and the OpenAPI doc blocks in docs.paths.ts (do NOT write the literal
 * jsdoc-openapi tag in this prose — the generator globs routes/ and would spread the comment into the
 * spec). Static segments (`/roles`, `/assignments`) precede any `:id` so they are never captured as ids.
 */
const router = Router();

// Roles
router.get('/roles', listRoles);
router.post('/roles', createRole);
router.post('/roles/:id/permissions', setRolePermissions);
router.post('/roles/:id/archive', archiveRole);

// Assignments
router.get('/assignments', listAssignments);
router.post('/assignments', assignRole);
router.post('/assignments/:id/revoke', revokeAssignment);

export default router;
