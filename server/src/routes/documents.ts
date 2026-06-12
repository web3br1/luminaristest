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

// Static paths must come before /:id to avoid being shadowed
router.get('/', listDocuments);
router.get('/list', listDocumentNames);
router.get('/qdrant-status', qdrantStatus);
router.post('/search', searchDocuments);
router.post('/upload', uploadMiddleware, uploadDocument);
router.post('/token-cost', tokenCostUpload, computeTokenCost);
router.get('/:id', getDocumentById);
router.get('/:id/qdrant', getDocumentQdrant);
router.patch('/:id', updateDocument);
router.delete('/:id', deleteDocument);

export default router;
