/**
 * CRM KPIs
 *
 * Registers CRM analytics processors. They run over the `leads` table (with
 * cross-fetch to leadStages/leadProposals/leadActivities) and are consumed by
 * the dedicated CrmAnalyticsService (`/api/crm/pipeline-analytics`). Registered
 * here as well so the generic analytics engine can reuse them in the future.
 */
import { registerProcessor } from '../../core';
import { crmFunnelProcessor } from './CrmFunnelProcessor';
import { crmConversionProcessor } from './CrmConversionProcessor';
import { crmSourceProcessor, crmStatusProcessor, crmBantProcessor } from './CrmSegmentationProcessors';
import { crmProposalsByStatusProcessor, crmActivitiesByTypeProcessor } from './CrmRelatedProcessors';

registerProcessor('crmFunnel', crmFunnelProcessor);
registerProcessor('crmConversion', crmConversionProcessor);
registerProcessor('crmSource', crmSourceProcessor);
registerProcessor('crmStatus', crmStatusProcessor);
registerProcessor('crmBant', crmBantProcessor);
registerProcessor('crmProposalsByStatus', crmProposalsByStatusProcessor);
registerProcessor('crmActivitiesByType', crmActivitiesByTypeProcessor);

export {
  crmFunnelProcessor,
  crmConversionProcessor,
  crmSourceProcessor,
  crmStatusProcessor,
  crmBantProcessor,
  crmProposalsByStatusProcessor,
  crmActivitiesByTypeProcessor,
};
