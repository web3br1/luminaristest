/**
 * @deprecated R26 — structuredData route preserved but frontend is disconnected.
 * See features/structuredData/README.md for retirement context.
 */
import { Router } from 'express';
import { getStructuredDataByDocument, updateStructuredData } from '@/controllers/structuredDataController';

const router = Router();

// GET /api/structured-data/:documentId — recupera os dados estruturados de um documento
router.get('/:documentId', getStructuredDataByDocument);

// PUT /api/structured-data/:documentId — atualiza os dados estruturados de um documento
router.put('/:documentId', updateStructuredData);

export default router;
