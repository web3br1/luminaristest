import type { AccountingScope } from '../scope/AccountingScope';
import type { ReceiveStockParams, ReverseStockForReceiptParams } from './InventoryService';

/**
 * IInventoryService — the seam the AP→estoque bridge (INCR-INVENTORY D3(b) / Body 3) depends on. It
 * exposes ONLY the two subledger operations the `PayableService` bridge drives, so a Payable module can
 * be wired to inventory without importing the concrete `InventoryService` (kept an OPTIONAL constructor
 * dep until the Fase B factory wiring lands — the factory compiles with the arg absent):
 *   - `receiveStock`         — an inventory PURCHASE recognizes an INBOUND at `amountCents` (create path).
 *   - `reverseStockForReceipt` — cancelling that purchase re-removes the received stock at the ORIGINAL
 *     receipt cost (cancel path), mirroring the sale-side `reverseStockForSale` (D8).
 * Both are READ-FIRST idempotent on `sourceId` so a re-drive/replay values the SKU exactly once.
 */
export interface IInventoryService {
  receiveStock(scope: AccountingScope, params: ReceiveStockParams): Promise<{ valueCents: number }>;

  reverseStockForReceipt(
    scope: AccountingScope,
    params: ReverseStockForReceiptParams,
  ): Promise<{ totalReversedCents: number }>;
}
