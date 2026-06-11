import { Router } from 'express';
import { getStructuredDataByDocument } from '@/controllers/structuredDataController';

const router = Router();

// GET /api/structured-data/:documentId
router.get('/:documentId', getStructuredDataByDocument);

export default router;


