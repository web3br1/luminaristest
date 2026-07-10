import { ForbiddenError, ValidationError } from '../../../lib/errors';
import { MAX_CENTS } from '../models/money';
import { CLOSING_SOURCE_TYPE, closingSourceId } from '../models/closing';
import { RETAINED_EARNINGS_CODE } from '../fixtures/ChartOfAccountsFixture';
import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IPostingRepository } from '../repositories/IPostingRepository';
import type { JournalEntryWithPostings } from '../repositories/IJournalEntryRepository';
import type { PostingService } from './PostingService';
import type { PostEntryInput } from '../dtos/PostingDto';

/**
 * Statuses that make up the escrituração (everything except Draft). Kept local per the
 * existing module pattern (AccountingReportService/SpedGenerationService each hold their
 * own copy). Higiene item: consolidate the three into one shared const.
 */
const LEDGER_STATUSES = ['Posted', 'Reconciled', 'Reversed'];

/**
 * ExerciseClosingService — year-end result closing (encerramento/apuração do resultado),
 * BE-INCR-SPED-APURACAO. FIRST-CLASS PRISMA. Posts a REAL balanced closing entry that zeroes
 * every result account (Revenue/Expense) against retained earnings (Lucros ou Prejuízos
 * Acumulados, `2.3.1`), so the ECD reconciles in VALUE (I155(dez)=0, J100 A=P with detail)
 * and the I350/I355 register set becomes emittable. This is the write the SPED export layer
 * (read-only, D7) explicitly deferred — SPED then reads this posted entry like any other.
 *
 * Reuse: composes a multi-leg `PostEntryInput` and delegates the whole write (balance
 * invariant, period gate, entry numbering, audit, idempotency) to PostingService.postEntry —
 * mirroring AccountingSyncService. NO fabricated balances (D1): every amount comes from a
 * real pre-closing read.
 *
 * Idempotency (D5): one closing per (owner, unit, exercise), keyed sourceType='closing',
 * sourceId=String(year). Re-close returns the same entry. Reopening = reverse the closing via
 * the generic reverse path (PostingService.reverseEntry, made closing-aware) which frees the
 * key so a fresh close produces a NEW valid entry.
 */
export class ExerciseClosingService {
  constructor(
    private readonly accountRepo: IAccountRepository,
    private readonly postingRepo: IPostingRepository,
    private readonly posting: PostingService,
    private readonly policy: IAccountingPolicy,
  ) {}

  /**
   * Close the result of `year`: post the encerramento entry dated `year-12-31`. Idempotent
   * per exercise. Throws ValidationError if there is no result balance to close, or if any
   * leg magnitude exceeds the Int32 cents ceiling (MAX_CENTS, ACC-014). The period gate
   * (dezembro OPEN) is enforced by postEntry — surfaced honestly if closed.
   */
  public async closeExercise(scope: AccountingScope, year: number): Promise<JournalEntryWithPostings> {
    if (!this.policy.canPost(scope)) {
      throw new ForbiddenError('Você não tem permissão para encerrar o exercício.');
    }

    // Pre-closing result of THIS exercise: the current-year window [1 Jan .. 31 Dec], EXCLUDING
    // the closing entry itself. Result accounts are annual — bounding from 1 Jan is what keeps a
    // SECOND annual close correct: without it, excluding every 'closing' entry would re-inflate a
    // prior *closed* year's operational movement into this read and over-post (I155(dez)≠0 → PVA
    // rejeita). This is the SAME window incomeStatement/DRE uses (AccountingReportService), so
    // I355 and J150 agree. Year 1 is unaffected (1 Jan = inception).
    const dtIni = new Date(Date.UTC(year, 0, 1));
    const dtFin = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    const [accounts, totals] = await Promise.all([
      this.accountRepo.findManyByUnit(scope),
      this.postingRepo.groupByAccount(scope, LEDGER_STATUSES, {
        from: dtIni,
        to: dtFin,
        excludeSourceTypes: [CLOSING_SOURCE_TYPE],
      }),
    ]);

    const balByAccount = new Map(totals.map((t) => [t.accountId, t.debitCents - t.creditCents]));
    const resultAccounts = accounts
      .filter((a) => a.acceptsEntries && (a.nature === 'Revenue' || a.nature === 'Expense'))
      .sort((a, b) => a.code.localeCompare(b.code)); // determinismo

    // One leg per result account with a non-zero balance: post the OPPOSITE side to zero it.
    const lines: PostEntryInput['lines'] = [];
    let netSignedCents = 0; // Σ (debit − credit) over result accounts = C_r − D_r
    for (const account of resultAccounts) {
      const balance = balByAccount.get(account.id) ?? 0;
      if (balance === 0) continue;
      const magnitude = Math.abs(balance);
      this.assertUnderCeiling(magnitude, account.code);
      lines.push(
        balance < 0
          ? { accountCode: account.code, debitCents: magnitude, creditCents: 0 } // credit-balance (receita) → débito
          : { accountCode: account.code, debitCents: 0, creditCents: magnitude }, // debit-balance (despesa) → crédito
      );
      netSignedCents += balance;
    }

    if (lines.length === 0) {
      throw new ValidationError(`Não há saldo de contas de resultado para encerrar em ${year}.`);
    }

    // Retained-earnings offset (D4): net loss (Σ>0) debits PL, net profit (Σ<0) credits PL.
    // Only when the result is non-zero — if revenues exactly offset expenses the result legs
    // already balance and a zero PL leg would be an invalid partida.
    if (netSignedCents !== 0) {
      const magnitude = Math.abs(netSignedCents);
      this.assertUnderCeiling(magnitude, RETAINED_EARNINGS_CODE);
      lines.push(
        netSignedCents > 0
          ? { accountCode: RETAINED_EARNINGS_CODE, debitCents: magnitude, creditCents: 0 }
          : { accountCode: RETAINED_EARNINGS_CODE, debitCents: 0, creditCents: magnitude },
      );
    }

    const input: PostEntryInput = {
      unitId: scope.unitId,
      date: `${year}-12-31`,
      description: `Encerramento do exercício ${year} — apuração do resultado`,
      sourceType: CLOSING_SOURCE_TYPE,
      sourceId: closingSourceId(year),
      lines,
    };

    return this.posting.postEntry(scope, input);
  }

  /** Int32 cents ceiling guard (ACC-014): an accumulated result balance can exceed the per-
   * posting cap, and the closing leg is a single Int column — reject loudly, not as an opaque
   * write error. */
  private assertUnderCeiling(magnitudeCents: number, accountCode: string): void {
    if (magnitudeCents > MAX_CENTS) {
      throw new ValidationError(
        `Saldo de encerramento da conta '${accountCode}' excede o limite suportado (máx ${MAX_CENTS} centavos).`,
      );
    }
  }
}
