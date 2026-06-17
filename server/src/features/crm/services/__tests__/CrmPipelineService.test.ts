import { CrmPipelineService } from '../CrmPipelineService';
import { NotFoundError, ValidationError } from '../../../../lib/errors';

/**
 * CrmPipelineService orchestrates multi-step writes over DynamicTableService.
 * These tests verify (a) the correct delegated calls, (b) that every write in a
 * multi-step op runs inside the SAME transaction (options.tx), and (c) that an
 * error in a later step propagates (so prisma.$transaction rolls back — no
 * silent partial write, no manual compensation needed).
 */
const user = { userId: 'u1', role: 'USER' } as any;

// A preset-synced leads schema: has the conversion link fields and a status field whose
// options include 'Converted'. convertLead's partial-sync guard (FIX 2) inspects this.
const leadsSchema = {
  fields: [
    { name: 'leadName', label: 'Name', type: 'string', required: true },
    { name: 'accountId', label: 'Account', type: 'relation', required: false },
    { name: 'contactId', label: 'Contact', type: 'relation', required: false },
    { name: 'convertedAt', label: 'Converted At', type: 'datetime', required: false },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      options: ['Open', 'Won', 'Lost', 'Disqualified', 'Converted'],
      required: true,
    },
  ],
};

function buildService(over: { dts?: any; repo?: any } = {}) {
  const dynamicTableService = {
    // runInTransaction invokes the callback with a fake tx, mirroring prisma.$transaction.
    runInTransaction: jest.fn(async (fn: any) => fn({ __tx: true } as any)),
    createTableData: jest.fn(async () => ({ id: 'proposal-1' })),
    updateTableData: jest.fn(async () => ({ id: 'lead-1', data: {} })),
    ...over.dts,
  };
  const repository = {
    findTableByInternalName: jest.fn(async (_uid: string, internal: string) => ({
      id: `${internal}-table`,
      userId: 'u1',
      // leads table must expose a preset-synced schema (FIX 2 partial-sync guard);
      // other tables don't have their schema inspected by convertLead.
      schema: internal === 'leads' ? leadsSchema : { fields: [] },
    })),
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

  describe('convertLead', () => {
    // The lead snapshot read by convertLead (via repository.findDataById) — owner inherited
    // from assigneeId, base contact fields (leadName/email/phone) carried into the contact.
    const leadRow = {
      id: 'lead-1',
      // Belongs to THIS tenant's leads table (id is `${internal}-table` per the repo mock).
      // convertLead's cross-tenant guard (FIX 1) asserts this matches the resolved leads id.
      dynamicTableId: 'leads-table',
      data: {
        unitId: 'unit-1',
        assigneeId: 'emp-1',
        leadName: 'Acme Corp',
        email: 'sales@acme.com',
        phone: '11999990000',
        status: 'Open',
      },
    };

    // convertLead reads the lead through the repository and writes account/contact/lead.
    // createTableData is called twice (account then contact) — distinct ids per call order.
    function buildConvert(overData: { findDataById?: any; createTableData?: any; status?: string } = {}) {
      const account = { id: 'acc-1' };
      const contact = { id: 'con-1' };
      const createTableData =
        overData.createTableData ??
        jest
          .fn()
          .mockResolvedValueOnce(account)
          .mockResolvedValueOnce(contact);
      const findDataById =
        overData.findDataById ??
        jest.fn(async () => ({
          ...leadRow,
          data: { ...leadRow.data, status: overData.status ?? leadRow.data.status },
        }));
      const built = buildService({
        dts: { createTableData },
        repo: { findDataById },
      });
      return { ...built, account, contact, createTableData, findDataById };
    }

    const baseInput = {
      leadId: 'lead-1',
      account: { name: 'Acme Corp', segment: 'SaaS' },
    };

    it('é atômico: 1× runInTransaction, 2× createTableData (account+contact) e 1× updateTableData (lead) — todos no MESMO tx', async () => {
      const { svc, dynamicTableService } = buildConvert();
      await svc.convertLead(user, baseInput);

      expect(dynamicTableService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(dynamicTableService.createTableData).toHaveBeenCalledTimes(2);
      expect(dynamicTableService.updateTableData).toHaveBeenCalledTimes(1);

      // account create — resolved table id + same tx
      expect(dynamicTableService.createTableData).toHaveBeenNthCalledWith(
        1, user, 'crmAccounts-table', expect.any(Object), txArg,
      );
      // contact create — resolved table id + same tx
      expect(dynamicTableService.createTableData).toHaveBeenNthCalledWith(
        2, user, 'crmContacts-table', expect.any(Object), txArg,
      );
      // lead update — isSystem (readOnly convertedAt + terminal status) + same tx
      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(
        user, 'lead-1', expect.any(Object), { tx: { __tx: true }, isSystem: true },
      );
    });

    it('herda o owner do lead (assigneeId) na account e no contact', async () => {
      const { svc, dynamicTableService } = buildConvert();
      await svc.convertLead(user, baseInput);

      expect(dynamicTableService.createTableData).toHaveBeenNthCalledWith(
        1, user, 'crmAccounts-table',
        { data: expect.objectContaining({ ownerId: 'emp-1', name: 'Acme Corp', unitId: 'unit-1', segment: 'SaaS' }) },
        txArg,
      );
      expect(dynamicTableService.createTableData).toHaveBeenNthCalledWith(
        2, user, 'crmContacts-table',
        { data: expect.objectContaining({ ownerId: 'emp-1' }) },
        txArg,
      );
    });

    it('liga o contact à account criada (accountId) e ao lead de origem (leadId), herdando email/phone', async () => {
      const { svc, dynamicTableService } = buildConvert();
      await svc.convertLead(user, baseInput);

      expect(dynamicTableService.createTableData).toHaveBeenNthCalledWith(
        2, user, 'crmContacts-table',
        {
          data: expect.objectContaining({
            accountId: 'acc-1',
            leadId: 'lead-1',
            name: 'Acme Corp',
            email: 'sales@acme.com',
            phone: '11999990000',
          }),
        },
        txArg,
      );
    });

    it('marca o lead Converted com accountId/contactId/convertedAt', async () => {
      const { svc, dynamicTableService } = buildConvert();
      await svc.convertLead(user, baseInput);

      const updateCall = dynamicTableService.updateTableData.mock.calls[0];
      expect(updateCall[1]).toBe('lead-1');
      expect(updateCall[2].data).toEqual(
        expect.objectContaining({
          status: 'Converted',
          accountId: 'acc-1',
          contactId: 'con-1',
        }),
      );
      expect(typeof updateCall[2].data.convertedAt).toBe('string');
    });

    it('guard: lead já Converted → ValidationError (idempotência), sem escritas', async () => {
      const { svc, dynamicTableService } = buildConvert({ status: 'Converted' });
      await expect(svc.convertLead(user, baseInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
    });

    it('cross-tenant / tabela ausente → NotFoundError', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(svc.convertLead(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lead inexistente → NotFoundError', async () => {
      const { svc } = buildConvert({ findDataById: jest.fn(async () => null) });
      await expect(svc.convertLead(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
    });

    // FIX 1 — cross-tenant read: findDataById is NOT tenant-scoped. A row whose
    // dynamicTableId !== the caller's resolved leads table id must be treated as
    // non-existent (NotFoundError, no PII leak), and NO write may occur.
    it('lead de outro tenant (dynamicTableId ≠ tabela de leads do caller) → NotFoundError, sem escritas', async () => {
      const foreignRow = {
        id: 'lead-1',
        dynamicTableId: 'someone-else-leads-table',
        data: { leadName: 'Foreign Co', email: 'x@y.com', status: 'Open' },
      };
      const { svc, dynamicTableService } = buildConvert({
        findDataById: jest.fn(async () => foreignRow),
      });
      await expect(svc.convertLead(user, baseInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
    });

    // FIX 2 — partial-sync guard: leads table missing convertedAt (or status without
    // 'Converted') means the engine would silently strip the link fields. Reject with
    // ValidationError BEFORE the transaction so no orphan account/contact is created.
    it('tabela de leads não sincronizada (sem convertedAt) → ValidationError, sem createTableData', async () => {
      const unsyncedSchema = {
        fields: leadsSchema.fields.filter((f) => f.name !== 'convertedAt'),
      };
      const { svc, dynamicTableService } = buildService({
        dts: {
          createTableData: jest.fn(),
          updateTableData: jest.fn(),
        },
        repo: {
          findTableByInternalName: jest.fn(async (_uid: string, internal: string) => ({
            id: `${internal}-table`,
            userId: 'u1',
            schema: internal === 'leads' ? unsyncedSchema : { fields: [] },
          })),
          findDataById: jest.fn(async () => ({ ...leadRow })),
        },
      });
      await expect(svc.convertLead(user, baseInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
    });
  });

  describe('advanceOpportunity', () => {
    // The opportunity row read by advanceOpportunity's cross-tenant guard (FIX 2). Belongs to
    // THIS tenant's crmOpportunities table (id is `${internal}-table` per the repo mock).
    const oppRow = { id: 'opp-1', dynamicTableId: 'crmOpportunities-table', data: {} };
    const oppRepo = { findDataById: jest.fn(async () => ({ ...oppRow })) };

    it('aplica o patch de stage (+amount/currency/winProbability) com isSystem', async () => {
      const { svc, dynamicTableService } = buildService({
        dts: { updateTableData: jest.fn(async () => ({ id: 'opp-1', data: {} })) },
        repo: oppRepo,
      });
      await svc.advanceOpportunity(user, {
        opportunityId: 'opp-1',
        stageId: 's2',
        amount: 5000,
        currency: 'USD',
        winProbability: 60,
      });

      expect(dynamicTableService.updateTableData).toHaveBeenCalledWith(
        user,
        'opp-1',
        { data: expect.objectContaining({ stageId: 's2', amount: 5000, currency: 'USD', winProbability: 60 }) },
        { isSystem: true },
      );
    });

    it('closed_won → status Won + closedAt (string ISO), isSystem', async () => {
      const { svc, dynamicTableService } = buildService({
        dts: { updateTableData: jest.fn(async () => ({ id: 'opp-1', data: {} })) },
        repo: oppRepo,
      });
      await svc.advanceOpportunity(user, { opportunityId: 'opp-1', stageId: 's-won', stageType: 'closed_won' });

      const call = dynamicTableService.updateTableData.mock.calls[0];
      expect(call[3]).toEqual({ isSystem: true });
      expect(call[2].data).toEqual(expect.objectContaining({ stageId: 's-won', status: 'Won' }));
      expect(typeof call[2].data.closedAt).toBe('string');
    });

    it('closed_lost → status Lost + closedAt', async () => {
      const { svc, dynamicTableService } = buildService({
        dts: { updateTableData: jest.fn(async () => ({ id: 'opp-1', data: {} })) },
        repo: oppRepo,
      });
      await svc.advanceOpportunity(user, { opportunityId: 'opp-1', stageId: 's-lost', stageType: 'closed_lost' });

      const call = dynamicTableService.updateTableData.mock.calls[0];
      expect(call[2].data).toEqual(expect.objectContaining({ status: 'Lost' }));
      expect(typeof call[2].data.closedAt).toBe('string');
    });

    it('NotFoundError se crmOpportunities não está instalada', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(
        svc.advanceOpportunity(user, { opportunityId: 'opp-1', stageId: 's2' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // FIX 2 — cross-tenant read: a row whose dynamicTableId !== the caller's resolved
    // crmOpportunities table id must be treated as non-existent (NotFoundError, no
    // ForbiddenError enumeration), and NO update may occur.
    it('opportunity de outro tenant (dynamicTableId ≠ crmOpportunities do caller) → NotFoundError, sem update', async () => {
      const { svc, dynamicTableService } = buildService({
        dts: { updateTableData: jest.fn(async () => ({ id: 'opp-1', data: {} })) },
        repo: {
          findDataById: jest.fn(async () => ({ id: 'opp-1', dynamicTableId: 'someone-else-opps-table', data: {} })),
        },
      });
      await expect(
        svc.advanceOpportunity(user, { opportunityId: 'opp-1', stageId: 's2' }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(dynamicTableService.updateTableData).not.toHaveBeenCalled();
    });
  });

  describe('convertLeadToOpportunity', () => {
    const oppLeadRow = {
      id: 'lead-1',
      dynamicTableId: 'leads-table',
      data: { unitId: 'unit-1', assigneeId: 'emp-1', accountId: 'acc-9', leadName: 'Acme', status: 'Open' },
    };

    // leadStages rows for pipe-1 — returned out of order so the sort-by-`order` is exercised.
    // When input has no stageId, the service resolves stageId = first stage (lowest order).
    const stageRows = [
      { id: 'stage-mid', dynamicTableId: 'leadStages-table', data: { pipelineId: 'pipe-1', order: 2 } },
      { id: 'stage-first', dynamicTableId: 'leadStages-table', data: { pipelineId: 'pipe-1', order: 0 } },
      { id: 'stage-late', dynamicTableId: 'leadStages-table', data: { pipelineId: 'pipe-1', order: 5 } },
    ];

    function buildOppConvert(over: { findDataById?: any; findRowsByFieldValue?: any } = {}) {
      const createTableData = jest.fn(async () => ({ id: 'opp-1' }));
      const findDataById = over.findDataById ?? jest.fn(async () => ({ ...oppLeadRow }));
      const findRowsByFieldValue = over.findRowsByFieldValue ?? jest.fn(async () => [...stageRows]);
      const built = buildService({ dts: { createTableData }, repo: { findDataById, findRowsByFieldValue } });
      return { ...built, createTableData, findRowsByFieldValue };
    }

    const oppInput = { leadId: 'lead-1', name: 'Acme Deal', pipelineId: 'pipe-1', currency: 'BRL' as const };

    it('cria a opportunity atômica (1× runInTransaction, 1× createTableData no MESMO tx)', async () => {
      const { svc, dynamicTableService } = buildOppConvert();
      const out = await svc.convertLeadToOpportunity(user, oppInput);

      expect(out).toEqual({ id: 'opp-1' });
      expect(dynamicTableService.runInTransaction).toHaveBeenCalledTimes(1);
      expect(dynamicTableService.createTableData).toHaveBeenCalledTimes(1);
      expect(dynamicTableService.createTableData).toHaveBeenCalledWith(
        user, 'crmOpportunities-table', expect.any(Object), txArg,
      );
    });

    it('herda owner (assigneeId) e unit do lead; status Open; accountId do lead quando não informado', async () => {
      const { svc, dynamicTableService } = buildOppConvert();
      await svc.convertLeadToOpportunity(user, oppInput);

      const call = dynamicTableService.createTableData.mock.calls[0];
      expect(call[2].data).toEqual(
        expect.objectContaining({
          leadId: 'lead-1',
          unitId: 'unit-1',
          ownerId: 'emp-1',
          pipelineId: 'pipe-1',
          name: 'Acme Deal',
          status: 'Open',
          accountId: 'acc-9',
          currency: 'BRL',
        }),
      );
    });

    it('accountId do input tem precedência sobre o do lead', async () => {
      const { svc, dynamicTableService } = buildOppConvert();
      await svc.convertLeadToOpportunity(user, { ...oppInput, accountId: 'acc-override' });
      const call = dynamicTableService.createTableData.mock.calls[0];
      expect(call[2].data.accountId).toBe('acc-override');
    });

    // FIX 1 — stageId default: input has NO stageId, so the service resolves the pipeline's
    // first stage (lowest `order`) via findRowsByFieldValue('leadStages', 'pipelineId', ...).
    it('sem stageId no input → usa a primeira etapa do pipeline (menor order)', async () => {
      const { svc, dynamicTableService, findRowsByFieldValue } = buildOppConvert();
      await svc.convertLeadToOpportunity(user, oppInput);
      expect(findRowsByFieldValue).toHaveBeenCalledWith('leadStages-table', 'pipelineId', 'pipe-1');
      const call = dynamicTableService.createTableData.mock.calls[0];
      expect(call[2].data.stageId).toBe('stage-first');
    });

    it('stageId do input tem precedência (não consulta leadStages)', async () => {
      const { svc, dynamicTableService, findRowsByFieldValue } = buildOppConvert();
      await svc.convertLeadToOpportunity(user, { ...oppInput, stageId: 'stage-explicit' });
      expect(findRowsByFieldValue).not.toHaveBeenCalled();
      const call = dynamicTableService.createTableData.mock.calls[0];
      expect(call[2].data.stageId).toBe('stage-explicit');
    });

    it('pipeline sem etapas → ValidationError, sem escritas', async () => {
      const { svc, dynamicTableService } = buildOppConvert({
        findRowsByFieldValue: jest.fn(async () => []),
      });
      await expect(svc.convertLeadToOpportunity(user, oppInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
    });

    it('lead sem unitId → ValidationError, sem escritas', async () => {
      const { svc, dynamicTableService } = buildOppConvert({
        findDataById: jest.fn(async () => ({ ...oppLeadRow, data: { ...oppLeadRow.data, unitId: undefined } })),
      });
      await expect(svc.convertLeadToOpportunity(user, oppInput)).rejects.toBeInstanceOf(ValidationError);
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
    });

    it('lead de outro tenant (dynamicTableId ≠ leads do caller) → NotFoundError, sem escritas', async () => {
      const { svc, dynamicTableService } = buildOppConvert({
        findDataById: jest.fn(async () => ({ ...oppLeadRow, dynamicTableId: 'someone-else-leads-table' })),
      });
      await expect(svc.convertLeadToOpportunity(user, oppInput)).rejects.toBeInstanceOf(NotFoundError);
      expect(dynamicTableService.createTableData).not.toHaveBeenCalled();
      expect(dynamicTableService.runInTransaction).not.toHaveBeenCalled();
    });

    it('lead inexistente → NotFoundError', async () => {
      const { svc } = buildOppConvert({ findDataById: jest.fn(async () => null) });
      await expect(svc.convertLeadToOpportunity(user, oppInput)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('NotFoundError se crmOpportunities não está instalada', async () => {
      const { svc } = buildService({ repo: { findTableByInternalName: jest.fn(async () => null) } });
      await expect(svc.convertLeadToOpportunity(user, oppInput)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
