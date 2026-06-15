import { crmFunnelProcessor } from '../CrmFunnelProcessor';
import { crmConversionProcessor } from '../CrmConversionProcessor';
import { crmSourceProcessor, crmStatusProcessor, crmBantProcessor } from '../CrmSegmentationProcessors';
import { crmProposalsByStatusProcessor, crmActivitiesByTypeProcessor } from '../CrmRelatedProcessors';

describe('CRM KPI processors (QA Gold Standard)', () => {
  const referenceDate = new Date('2026-02-01T12:00:00Z');

  // Lead rows in the real shape { id, data: {...} }. The dedicated service injects _createdAt/_updatedAt.
  const leads = [
    { id: 'l1', data: { status: 'Open', source: 'LinkedIn', stageId: 's1', latestProposalAmount: 100000, latestProposalWinProbability: 50, bantBudget: 'High', bantAuthority: 'High', bantNeed: 'Medium', bantTiming: 'Short', _createdAt: '2026-01-10T00:00:00Z' } },
    { id: 'l2', data: { status: 'Open', source: 'LinkedIn', stageId: 's2', latestProposalAmount: 50000, latestProposalWinProbability: 80, bantBudget: 'Low', bantAuthority: 'Medium', bantNeed: 'High', bantTiming: 'Long', _createdAt: '2026-01-20T00:00:00Z' } },
    { id: 'l3', data: { status: 'Won', source: 'Indicação', stageId: 's3', latestProposalAmount: 200000, _createdAt: '2025-12-01T00:00:00Z', _updatedAt: '2026-01-01T00:00:00Z' } },
    { id: 'l4', data: { status: 'Lost', source: 'Indicação', stageId: 's3', _createdAt: '2025-11-01T00:00:00Z' } },
  ];

  const stagesRes = {
    table: {} as any,
    schema: {} as any,
    rows: [
      { id: 's1', data: { name: 'Sem Contato', order: 1, pipelineId: 'p1' } },
      { id: 's2', data: { name: 'Reunião', order: 2, pipelineId: 'p1' } },
      { id: 's3', data: { name: 'Fechamento', order: 4, pipelineId: 'p1' } },
    ],
  };

  const ctx = (rows: any[] = leads): any => ({
    rows,
    params: { referenceDate, timeZone: 'America/Sao_Paulo', datePreset: 'thisYear' },
    fetchByPresetTableKey: async (key: string) => (key === 'leadStages' ? stagesRes : { table: {}, schema: {}, rows: [] }),
  });

  describe('crmConversionProcessor', () => {
    it('calcula win rate, pipeline value e forecast corretamente', async () => {
      const out = await crmConversionProcessor(ctx());
      const get = (n: string) => out.find((p) => p.name === n)?.value;
      expect(get('totalLeads')).toBe(4);
      expect(get('openLeads')).toBe(2);
      expect(get('wonLeads')).toBe(1);
      expect(get('winRate')).toBe(50); // 1 won / (1 won + 1 lost) = 50%
      expect(get('pipelineValue')).toBeCloseTo(150000, 2); // só os Open: 100k + 50k
      expect(get('forecast')).toBeCloseTo(100000 * 0.5 + 50000 * 0.8, 2); // 90k
      expect(get('avgTicket')).toBeCloseTo(200000, 2); // único won
      expect(get('avgCycleDays')).toBe(31); // 01/12 → 01/01
    });

    it('retorna valores finitos com rows vazios (sem NaN)', async () => {
      const out = await crmConversionProcessor(ctx([]));
      out.forEach((p) => expect(Number.isFinite(p.value)).toBe(true));
      expect(out.find((p) => p.name === 'winRate')?.value).toBe(0);
    });
  });

  describe('crmFunnelProcessor', () => {
    it('conta leads por etapa, ordenado por order', async () => {
      const out = await crmFunnelProcessor(ctx());
      expect(out.map((p) => p.name)).toEqual(['Sem Contato', 'Reunião', 'Fechamento']);
      expect(out.map((p) => p.value)).toEqual([1, 1, 2]); // s3 (Fechamento) tem 2 leads
    });
  });

  describe('crmSourceProcessor', () => {
    it('agrupa leads por fonte, desc', async () => {
      const out = await crmSourceProcessor(ctx());
      expect(out.find((p) => p.name === 'LinkedIn')?.value).toBe(2);
      expect(out.find((p) => p.name === 'Indicação')?.value).toBe(2);
    });
  });

  describe('crmStatusProcessor', () => {
    it('agrupa por status', async () => {
      const out = await crmStatusProcessor(ctx());
      expect(out.find((p) => p.name === 'Open')?.value).toBe(2);
      expect(out.find((p) => p.name === 'Won')?.value).toBe(1);
      expect(out.find((p) => p.name === 'Lost')?.value).toBe(1);
    });
  });

  describe('crmBantProcessor', () => {
    it('calcula % de leads fortes por dimensão', async () => {
      const out = await crmBantProcessor(ctx());
      // Budget High: l1 → 1/4 = 25%
      expect(out.find((p) => p.name === 'Budget')?.value).toBe(25);
      expect(out.every((p) => p.value >= 0 && p.value <= 100)).toBe(true);
    });
  });

  // Cross-fetch processors read from sibling preset tables (leadProposals / leadActivities).
  const relatedCtx = (key: string, rows: any[]): any => ({
    rows: [],
    params: { referenceDate, timeZone: 'UTC', datePreset: 'thisYear' },
    fetchByPresetTableKey: async (k: string) =>
      k === key ? { table: {}, schema: {}, rows } : { table: {}, schema: {}, rows: [] },
  });

  describe('crmProposalsByStatusProcessor', () => {
    it('agrupa propostas por status na ordem canônica', async () => {
      const proposals = [
        { id: 'p1', data: { status: 'Sent' } },
        { id: 'p2', data: { status: 'Draft' } },
        { id: 'p3', data: { status: 'Sent' } },
        { id: 'p4', data: { status: 'Accepted' } },
      ];
      const out = await crmProposalsByStatusProcessor(relatedCtx('leadProposals', proposals));
      expect(out.map((p) => p.name)).toEqual(['Draft', 'Sent', 'Accepted']);
      expect(out.find((p) => p.name === 'Sent')?.value).toBe(2);
    });

    it('retorna lista vazia sem cross-fetch (sem NaN)', async () => {
      const out = await crmProposalsByStatusProcessor({ rows: [], params: {} } as any);
      expect(out).toEqual([]);
    });
  });

  describe('crmActivitiesByTypeProcessor', () => {
    it('agrupa atividades por tipo, desc', async () => {
      const activities = [
        { id: 'a1', data: { type: 'meeting' } },
        { id: 'a2', data: { type: 'note' } },
        { id: 'a3', data: { type: 'meeting' } },
        { id: 'a4', data: { type: 'meeting' } },
      ];
      const out = await crmActivitiesByTypeProcessor(relatedCtx('leadActivities', activities));
      expect(out[0]).toEqual({ name: 'meeting', value: 3 });
      expect(out.find((p) => p.name === 'note')?.value).toBe(1);
    });

    it('retorna lista vazia sem cross-fetch (sem NaN)', async () => {
      const out = await crmActivitiesByTypeProcessor({ rows: [], params: {} } as any);
      expect(out).toEqual([]);
    });
  });
});
