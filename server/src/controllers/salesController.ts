import { Request, Response } from 'express';
import { getUserContextFromRequest } from '../lib/authUtils';
import { handleApiError } from '../lib/apiUtils';
import { UnauthorizedError } from '../lib/errors';
import { getFactory } from '../lib/factory';
import { CancelSaleSchema, ReturnSaleSchema } from '../features/sales/dtos/SalesCancellationDto';
import { RegisterPaymentSchema } from '../features/sales/dtos/RegisterPaymentDto';

/** POST /api/sales/cancel — transition a finalized sale to Cancelled (estorno of revenue). */
export const cancelSale = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = CancelSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getSalesCancellationService().cancel(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/sales/return — transition a finalized sale to Returned (contra-revenue entry). */
export const returnSale = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ReturnSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getSalesCancellationService().return_(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/sales/pay — register payment for a finalized sale (settlement: baixa de A Receber). */
export const registerPayment = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = RegisterPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getRegisterPaymentService().registerPayment(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
