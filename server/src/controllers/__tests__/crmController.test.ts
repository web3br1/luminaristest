import type { Request, Response } from 'express';

// --- Mock the controller's collaborators (auth, factory, error handler, logger) ---
const advanceOpportunity = jest.fn();
const bookWonOpportunity = jest.fn();
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
    getCrmReceivableBridge: () => ({ bookWonOpportunity }),
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
    accountId: 'acc-row-1',
  },
};

describe('crmController.advanceOpportunity → CRM→AR bridge wiring (ADR-CRM-AR-SEAM)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls the bridge ONLY when the result status is Won, and AFTER the transition', async () => {
    advanceOpportunity.mockResolvedValueOnce(wonRow);
    bookWonOpportunity.mockResolvedValueOnce({ outcome: 'created', receivableId: 'recv-1' });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(bookWonOpportunity).toHaveBeenCalledTimes(1);
    // ordering: transition committed BEFORE the post-commit bridge
    expect(advanceOpportunity.mock.invocationCallOrder[0]).toBeLessThan(
      bookWonOpportunity.mock.invocationCallOrder[0],
    );
    const [scope, fact] = bookWonOpportunity.mock.calls[0];
    expect(scope).toMatchObject({ ownerUserId: 'u1', actorUserId: 'u1', unitId: 'unit-1' });
    expect(fact).toMatchObject({
      opportunityId: 'opp-1',
      unitId: 'unit-1',
      amount: 1000,
      label: 'Deal ACME',
      accountRef: 'acc-row-1',
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: wonRow });
  });

  it('does NOT call the bridge for non-Won transitions', async () => {
    advanceOpportunity.mockResolvedValueOnce({ id: 'opp-1', data: { status: 'Open', unitId: 'unit-1' } });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(bookWonOpportunity).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('a bridge failure does NOT change the success response of the transition (non-fatal) and is logged', async () => {
    advanceOpportunity.mockResolvedValueOnce(wonRow);
    bookWonOpportunity.mockRejectedValueOnce(new Error('posting down'));
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: wonRow });
    expect(handleApiError).not.toHaveBeenCalled(); // not surfaced as an API error
    expect(loggerError).toHaveBeenCalled(); // failure logged for reconciliation
  });

  it('skips the bridge (no crash) when a Won opportunity has no unitId', async () => {
    advanceOpportunity.mockResolvedValueOnce({ id: 'opp-1', data: { status: 'Won', amount: 1000 } });
    const res = mockRes();

    await advanceOpportunityHandler(baseReq, res);

    expect(bookWonOpportunity).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
