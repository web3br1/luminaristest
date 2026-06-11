/**
 * @deprecated R26 — structuredData route preserved but frontend is disconnected.
 * See features/structuredData/README.md for retirement context.
 */
import { Router } from 'express';
import { getStructuredDataByDocument } from '@/controllers/structuredDataController';

const router = Router();

// GET /api/structured-data/:documentId
router.get('/:documentId', getStructuredDataByDocument);

export default router;


