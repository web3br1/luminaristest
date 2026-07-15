import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import { htmlToPdf } from '../../../lib/pdf';
import { renderReceiptHtml, type ReceiptData } from '../../../lib/receiptHtml';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IJournalEntryRepository } from '../repositories/IJournalEntryRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';

/** Metadata + bytes for streaming a generated receipt. */
export interface ReceiptArtifact {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

/**
 * Generates a printable receipt (comprovante) for a single journal entry.
 *
 * READ-ONLY: composes the entry read + per-leg account name reads, renders the pure
 * HTML serializer, and streams the PDF. NOTHING is persisted — a receipt is a
 * deterministic render of an immutable entry, always regenerable, so storing it would
 * be YAGNI (ponytail). Persist as a DocumentAttachment only if a signed/archived copy is
 * ever required. No prisma.* and no Express here; the canRead policy is the only gate.
 */
export class ReceiptService {
  constructor(
    private readonly entries: IJournalEntryRepository,
    private readonly accounts: IAccountRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  public async generateEntryReceipt(scope: AccountingScope, entryId: string): Promise<ReceiptArtifact> {
    if (!this.policy.canRead(scope)) {
      throw new ForbiddenError('Não autorizado a emitir comprovantes contábeis.');
    }

    const entry = await this.entries.findById(scope, entryId);
    if (!entry) throw new NotFoundError('Lançamento não encontrado.');

    // A receipt is only meaningful for a numbered (posted-family) entry. Draft/PendingApproval
    // entries (ADR-INCR-APPROVAL) have no entryNumber/fiscalYear yet — reject them explicitly
    // instead of rendering a "nº null/null" comprovante.
    if (entry.entryNumber === null || entry.fiscalYear === null) {
      throw new ValidationError('Comprovante disponível apenas para lançamentos postados.');
    }
    const entryNumber = entry.entryNumber;
    const fiscalYear = entry.fiscalYear;

    // An entry has a handful of legs — resolve each account's code/name. findById gives
    // bare postings; a removed account (soft-deleted) surfaces as a placeholder rather
    // than dropping the leg, so the comprovante stays balanced.
    const lines = await Promise.all(
      entry.postings.map(async (p) => {
        const acc = await this.accounts.findById(scope, p.accountId);
        return {
          code: acc?.code ?? '—',
          name: acc?.name ?? '(conta removida)',
          debitCents: p.debitCents,
          creditCents: p.creditCents,
        };
      }),
    );

    const data: ReceiptData = {
      entryNumber,
      fiscalYear,
      status: entry.status,
      date: entry.date,
      description: entry.description,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      lines,
    };

    const buffer = await htmlToPdf(renderReceiptHtml(data, new Date()));
    return {
      buffer,
      fileName: `comprovante-lancamento-${fiscalYear}-${entryNumber}.pdf`,
      mimeType: 'application/pdf',
    };
  }
}
