import { Router } from 'express';
import {
  listDocuments,
  listDocumentNames,
  getDocumentById,
  deleteDocument,
  searchDocuments,
  uploadDocument,
  updateDocument,
  uploadMiddleware,
  qdrantStatus,
  getDocumentQdrant,
  tokenCostUpload,
  computeTokenCost,
} from '@/controllers/documentsController';

const router = Router();

router.get('/', listDocuments);
router.get('/list', listDocumentNames);
router.get('/:id', getDocumentById);
router.delete('/:id', deleteDocument);
router.post('/search', searchDocuments);
router.post('/upload', uploadMiddleware, uploadDocument);
router.patch('/:id', updateDocument);

// Extras
router.get('/qdrant-status', qdrantStatus);
router.get('/:id/qdrant', getDocumentQdrant);
router.post('/token-cost', tokenCostUpload, computeTokenCost);

export default router;
