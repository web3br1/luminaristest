import type { Request, Response } from 'express';

// --- Mock the controller's collaborators (auth, factory, error handler, logger) ---
const advanceOpportunity = jest.fn();
const sync = jest.fn();
const getUserContextFromRequest = jest.fn(() => ({ userId: 'u1' }));
const handleApiError = jest.fn();
const loggerError = jest.fn();

jest.mock('../../lib/authUtils', () => ({
  __esModule: true,
  getUserContextFromRequest: (req: unknown) => getUserContextFromRequest(),
}));
jest.mock('../../lib/apiUtils', () => ({
  __esModule: true,
  handleApiError: (...args: unknown[]) => handleApiError(...args),
}));
jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => loggerError(...a), debug: jest.fn() },
}));
jest.mock('../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getCrmPipelineService: () => ({ advanceOpportunity }),
    getAccountingSyncService: () => ({ sync }),
  }),
}));

import { advanceOpportunity as advanceOpportunityHandler } from '../crmController';

function mockRes(): Response {
  const res = {} as Response;
  res.status = jest.fn(() => res) as unknown as Response['status'];
  res.json = jest.fn(() => res) as unknown as Response['json'];
  return res;
}

const baseReq = {
  body: { opportunityId: 'opp-1', stageId: 'stage-1', stageType: 'closed_won' },
} as unknown as Request;

const wonRow = {
  id: 'opp-1',
  data: {
    status: 'Won',
    unitId: 'unit-1',
    amount: 1000,
    currency: 'BRL',
    closedAt: '2026-06-25T00:00:00.000Z',
    name: 'Deal ACME',
  },
};

describe('crmController.advanceOpportunity → AccountingSync wiring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls AccountingSync ONLY when the result status is Won, and AFTER the transition', async () => {
    advanceOpportunity.mockResolvedValueOnce(wonRow);
    sync.mockResolvedValueOnce({ entryId: 'entry-1' });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(sync).toHaveBeenCalledTimes(1);
    // ordering: transition committed BEFORE the post-commit sync
    expect(advanceOpportunity.mock.invocationCallOrder[0]).toBeLessThan(sync.mock.invocationCallOrder[0]);
    const [scope, event] = sync.mock.calls[0];
    expect(scope).toMatchObject({ ownerUserId: 'u1', actorUserId: 'u1', unitId: 'unit-1' });
    expect(event).toMatchObject({ sourceType: 'crm.opportunity.won', sourceId: 'opp-1', unitId: 'unit-1', amount: 1000 });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: wonRow });
  });

  it('does NOT call AccountingSync for non-Won transitions', async () => {
    advanceOpportunity.mockResolvedValueOnce({ id: 'opp-1', data: { status: 'Open', unitId: 'unit-1' } });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(sync).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('a sync failure does NOT change the success response of the transition (non-fatal) and is logged', async () => {
    advanceOpportunity.mockResolvedValueOnce(wonRow);
    sync.mockRejectedValueOnce(new Error('posting down'));
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: wonRow });
    expect(handleApiError).not.toHaveBeenCalled(); // not surfaced as an API error
    expect(loggerError).toHaveBeenCalled(); // failure logged for reconciliation
  });

  it('skips sync (no crash) when a Won opportunity has no unitId', async () => {
    advanceOpportunity.mockResolvedValueOnce({ id: 'opp-1', data: { status: 'Won', amount: 1000 } });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(sync).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
