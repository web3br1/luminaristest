import { CrmPipelineService } from '../CrmPipelineService';
import { NotFoundError } from '../../../../lib/errors';

/**
 * CrmPipelineService orchestrates multi-step writes over DynamicTableService.
 * These tests verify (a) the correct delegated calls, (b) that every write in a
 * multi-step op runs inside the SAME transaction (options.tx), and (c) that an
 * error in a later step propagates (so prisma.$transaction rolls back — no
 * silent partial write, no manual compensation needed).
 */
const user = { userId: 'u1', role: 'USER' } as any;

function buildService(over: { dts?: any; repo?: any } = {}) {
  const dynamicTableService = {
    // runInTransaction invokes the callback with a fake tx, mirroring prisma.$transaction.
    runInTransaction: jest.fn(async (fn: any) => fn({ __tx: true } as any)),
    createTableData: jest.fn(async () => ({ id: 'proposal-1' })),
    updateTableData: jest.fn(async () => ({ id: 'lead-1', data: {} })),
    ...over.dts,
  };
  const repository = {
    findTableByInternalName: jest.fn(async (_uid: string, internal: string) => ({ id: `${internal}-table`, userId: 'u1' })),
    ...over.repo,
  };
  const svc = new CrmPipelineService(dynamicTableService as any, repository as any);
  return { svc, dynamicTableService, repository };
}

const txArg = { tx: { __tx: true } };

describe('CrmPipelineService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('advanceStage', () => {
    it('cria proposta + atualiza lead na MESMA transação quando stageType=proposal', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.advanceStage(user, { leadId: 'l1', stageId: 's2', stageType: 'proposal', amount: 1000, currency: 'BRL' });

      expect(dynamicTableService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(dynamicTableService.createTableData).toHaveBeenCalledTimes(1);
      // ambos os writes recebem o MESMO tx (atomicidade)
      expect(dynamicTableService.createTableData).toHaveBeenCalledWith(user, 'leadProposals-table', expect.any(Object), txArg);
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(user, 'l1', { data: expect.objectContaining({ stageId: 's2' }) }, txArg);
    });

    it('não cria proposta quando o stage não é de proposta', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.advanceStage(user, { leadId: 'l1', stageId: 's2' });
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(user, 'l1', expect.any(Object), txArg);
    });

    it('propaga o erro (sem swallow) se o update do lead falhar — rollback fica a cargo da transação', async () => {
      const { svc } = buildService({ dts: { updateTableData: jest.fn(async () => { throw new Error('boom'); }) } });
      await expect(
        svc.advanceStage(user, { leadId: 'l1', stageId: 's2', stageType: 'proposal', amount: 500 }),
      ).rejects.toThrow('boom');
    });

    it('lança NotFoundError se o módulo CRM (tabela leads) não está instalado', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(svc.advanceStage(user, { leadId: 'l1', stageId: 's2' })).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('createProposal', () => {
    it('cria proposta + atualiza snapshot do lead na mesma transação e retorna a proposta', async () => {
      const { svc, dynamicTableService } = buildService();
      const out = await svc.createProposal(user, { leadId: 'l1', amount: 2000, currency: 'USD' });
      expect(out).toEqual({ id: 'proposal-1' });
      expect(dynamicTableService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(dynamicTableService.createTableData).toHaveBeenCalledWith(user, 'leadProposals-table', expect.any(Object), txArg);
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(user, 'l1', { data: expect.objectContaining({ latestProposalAmount: 2000 }) }, txArg);
    });
  });

  describe('recordNoShow', () => {
    it('reschedule: loga atividade + atualiza nextActionAt na mesma transação', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.recordNoShow(user, { leadId: 'l1', option: 'reschedule', rescheduleAt: '2026-07-01T10:00:00Z' });
      expect(dynamicTableService.createTableData).toHaveBeenCalledWith(user, 'leadActivities-table', expect.objectContaining({ data: expect.objectContaining({ type: 'meeting_no_show' }) }), txArg);
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(user, 'l1', { data: { nextActionAt: '2026-07-01T10:00:00Z' } }, txArg);
    });

    it('revert: loga atividade + reverte stageId na mesma transação', async () => {
      const { svc, dynamicTableService } = buildService();
      await svc.recordNoShow(user, { leadId: 'l1', option: 'revert', previousStageId: 's1' });
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(user, 'l1', { data: { stageId: 's1' } }, txArg);
    });
  });
});
