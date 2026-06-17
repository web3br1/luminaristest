import { Router } from 'express';
import { advanceStage, convertLead, createProposal, recordNoShow, getCrmAnalytics } from '../controllers/crmController';

const router = Router();

// CRM pipeline orchestration — server-side business logic for lead transitions.
router.post('/pipeline/advance', advanceStage);
router.post('/pipeline/proposal', createProposal);
router.post('/pipeline/no-show', recordNoShow);
router.post('/pipeline/convert-lead', convertLead);

// CRM analytics — aggregated KPI bundle over the leads dataset.
router.get('/pipeline-analytics', getCrmAnalytics);

export default router;
