import { Router } from 'express';
import { advanceStage, convertLead, createProposal, recordNoShow, getCrmAnalytics, advanceOpportunity, convertLeadToOpportunity } from '../controllers/crmController';
import {
  uploadMiddleware,
  createAttachment,
  listAttachments,
  downloadAttachment,
  deleteAttachment,
} from '../controllers/attachmentsController';

const router = Router();

// CRM pipeline orchestration — server-side business logic for lead transitions.
router.post('/pipeline/advance', advanceStage);
router.post('/pipeline/proposal', createProposal);
router.post('/pipeline/no-show', recordNoShow);
router.post('/pipeline/convert-lead', convertLead);

// CRM opportunity transitions — first-class Opportunity (parallel to the lead pipeline).
router.post('/pipeline/advance-opportunity', advanceOpportunity);
router.post('/pipeline/convert-lead-to-opportunity', convertLeadToOpportunity);

// CRM analytics — aggregated KPI bundle over the leads dataset.
router.get('/pipeline-analytics', getCrmAnalytics);

// CRM attachments — downloadable file-store for record attachments.
router.post('/attachments', uploadMiddleware, createAttachment);
router.get('/attachments', listAttachments);
router.get('/attachments/:id/download', downloadAttachment);
router.delete('/attachments/:id', deleteAttachment);

export default router;
