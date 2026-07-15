import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import type { Account, DimensionValue } from 'generated/prisma';
import type { IPostingRepository, AccountDimensionTotals } from '../repositories/IPostingRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IDimensionRepository } from '../repositories/IDimensionRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AccountingScope } from '../scope/AccountingScope';
import type { DimensionReportQueryInput } from '../dtos/DimensionDto';
import { LEDGER_STATUSES } from '../models/ledgerStatus';

// ─── Report shapes (money in INTEGER CENTS) ─────────────────────────────────────

/** The synthetic bucket for legs not tagged on the queried axis. */
const NO_DIMENSION = '__NONE__';

export interface DimensionBalanceAccountRow {
  accountId: string;
  code: string;
  name: string;
  nature: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number; // debit - credit
}

export interface DimensionBalanceBucket {
  valueId: string | null; // null = "(sem dimensão)"
  valueCode: string | null;
  valueName: string;
  parentId: string | null;
  /** This value's OWN direct postings. */
  ownDebitCents: number;
  ownCreditCents: number;
  ownBalanceCents: number;
  /** Own + all descendants (rollup via parentId). Equals own for the null bucket and for leaves. */
  rollupDebitCents: number;
  rollupCreditCents: number;
  rollupBalanceCents: number;
  accounts: DimensionBalanceAccountRow[];
}

export interface DimensionBalanceReport {
  unitId: string;
  definitionId: string;
  definitionCode: string;
  definitionName: string;
  from: string | null;
  to: string | null;
  buckets: DimensionBalanceBucket[];
  /** Grand total across all buckets — equals the trial balance for the same window (ACC-024). */
  totals: { debitCents: number; creditCents: number; balanceCents: number };
}

export interface DimensionResultBucket {
  valueId: string | null;
  valueCode: string | null;
  valueName: string;
  parentId: string | null;
  ownRevenueCents: number;
  ownExpenseCents: number;
  ownResultCents: number; // revenue - expense
  rollupRevenueCents: number;
  rollupExpenseCents: number;
  rollupResultCents: number;
}

export interface DimensionResultReport {
  unitId: string;
  definitionId: string;
  definitionCode: string;
  definitionName: string;
  from: string | null;
  to: string | null;
  buckets: DimensionResultBucket[];
  totals: { revenueCents: number; expenseCents: number; resultCents: number };
}

/**
 * DimensionReportService — the READ side of dimensions (INCR-DIM Fatia 3, F6→a). Read-only,
 * first-class. Two slices, both ORTHOGONAL to the ledger (ACC-024 — summing every bucket, including
 * "(sem dimensão)", reproduces the trial balance / DRE for the same window):
 *   - balanceByDimension: the balancete recortado por valor de dimensão (per account within each value)
 *   - resultByDimension:  the DRE por dimensão (Revenue/Expense net per value)
 * Both roll up children into parents via the DimensionValue.parentId tree.
 */
export class DimensionReportService {
  constructor(
    private readonly postingRepo: IPostingRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly dimensionRepo: IDimensionRepository,
    private readonly policy: IAccountingPolicy,
  ) {}

  async balanceByDimension(
    scope: AccountingScope,
    query: DimensionReportQueryInput,
  ): Promise<DimensionBalanceReport> {
    const { definition, values, accountsById, totals } = await this.load(scope, query);

    // Aggregate per (valueKey) → per-account rows and own totals.
    const perBucket = new Map<string, { accounts: Map<string, DimensionBalanceAccountRow>; debit: number; credit: number }>();
    for (const t of totals) {
      const key = t.valueId ?? NO_DIMENSION;
      const bucket = perBucket.get(key) ?? { accounts: new Map(), debit: 0, credit: 0 };
      const account = accountsById.get(t.accountId);
      const row = bucket.accounts.get(t.accountId) ?? {
        accountId: t.accountId,
        code: account?.code ?? t.accountId,
        name: account?.name ?? t.accountId,
        nature: account?.nature ?? 'Unknown',
        debitCents: 0,
        creditCents: 0,
        balanceCents: 0,
      };
      row.debitCents += t.debitCents;
      row.creditCents += t.creditCents;
      row.balanceCents = row.debitCents - row.creditCents;
      bucket.accounts.set(t.accountId, row);
      bucket.debit += t.debitCents;
      bucket.credit += t.creditCents;
      perBucket.set(key, bucket);
    }

    // Rollup: own totals per value id, then walk the tree so a parent includes its descendants.
    const ownDebit = new Map<string | null, number>();
    const ownCredit = new Map<string | null, number>();
    for (const [key, b] of perBucket) {
      const id = key === NO_DIMENSION ? null : key;
      ownDebit.set(id, b.debit);
      ownCredit.set(id, b.credit);
    }
    const rollupDebit = this.rollup(values, ownDebit);
    const rollupCredit = this.rollup(values, ownCredit);

    const buckets: DimensionBalanceBucket[] = [];
    for (const value of values) {
      const key = value.id;
      const b = perBucket.get(key);
      const oD = b?.debit ?? 0;
      const oC = b?.credit ?? 0;
      const rD = rollupDebit.get(value.id) ?? 0;
      const rC = rollupCredit.get(value.id) ?? 0;
      buckets.push({
        valueId: value.id,
        valueCode: value.code,
        valueName: value.name,
        parentId: value.parentId,
        ownDebitCents: oD,
        ownCreditCents: oC,
        ownBalanceCents: oD - oC,
        rollupDebitCents: rD,
        rollupCreditCents: rC,
        rollupBalanceCents: rD - rC,
        accounts: b ? [...b.accounts.values()] : [],
      });
    }
    // The "(sem dimensão)" bucket (untagged legs) — never rolls up (no parent).
    const none = perBucket.get(NO_DIMENSION);
    if (none) {
      buckets.push({
        valueId: null,
        valueCode: null,
        valueName: '(sem dimensão)',
        parentId: null,
        ownDebitCents: none.debit,
        ownCreditCents: none.credit,
        ownBalanceCents: none.debit - none.credit,
        rollupDebitCents: none.debit,
        rollupCreditCents: none.credit,
        rollupBalanceCents: none.debit - none.credit,
        accounts: [...none.accounts.values()],
      });
    }

    const grand = totals.reduce(
      (acc, t) => ({ debitCents: acc.debitCents + t.debitCents, creditCents: acc.creditCents + t.creditCents }),
      { debitCents: 0, creditCents: 0 },
    );
    return {
      unitId: scope.unitId,
      definitionId: definition.id,
      definitionCode: definition.code,
      definitionName: definition.name,
      from: query.from ?? null,
      to: query.to ?? null,
      buckets,
      totals: { ...grand, balanceCents: grand.debitCents - grand.creditCents },
    };
  }

  async resultByDimension(
    scope: AccountingScope,
    query: DimensionReportQueryInput,
  ): Promise<DimensionResultReport> {
    const { definition, values, accountsById, totals } = await this.load(scope, query);

    // Own revenue/expense magnitudes per value: Revenue is credit-normal (credit - debit),
    // Expense is debit-normal (debit - credit). Non-result accounts are ignored (DRE scope).
    const ownRevenue = new Map<string | null, number>();
    const ownExpense = new Map<string | null, number>();
    for (const t of totals) {
      const account = accountsById.get(t.accountId);
      if (!account) continue;
      const id = t.valueId; // null = "(sem dimensão)"
      if (account.nature === 'Revenue') {
        ownRevenue.set(id, (ownRevenue.get(id) ?? 0) + (t.creditCents - t.debitCents));
      } else if (account.nature === 'Expense') {
        ownExpense.set(id, (ownExpense.get(id) ?? 0) + (t.debitCents - t.creditCents));
      }
    }
    const rollupRevenue = this.rollup(values, ownRevenue);
    const rollupExpense = this.rollup(values, ownExpense);

    const buckets: DimensionResultBucket[] = [];
    for (const value of values) {
      const oR = ownRevenue.get(value.id) ?? 0;
      const oE = ownExpense.get(value.id) ?? 0;
      const rR = rollupRevenue.get(value.id) ?? 0;
      const rE = rollupExpense.get(value.id) ?? 0;
      // Skip values with no result activity anywhere in their subtree (keeps the report readable).
      if (oR === 0 && oE === 0 && rR === 0 && rE === 0) continue;
      buckets.push({
        valueId: value.id,
        valueCode: value.code,
        valueName: value.name,
        parentId: value.parentId,
        ownRevenueCents: oR,
        ownExpenseCents: oE,
        ownResultCents: oR - oE,
        rollupRevenueCents: rR,
        rollupExpenseCents: rE,
        rollupResultCents: rR - rE,
      });
    }
    const noneR = ownRevenue.get(null) ?? 0;
    const noneE = ownExpense.get(null) ?? 0;
    if (noneR !== 0 || noneE !== 0) {
      buckets.push({
        valueId: null,
        valueCode: null,
        valueName: '(sem dimensão)',
        parentId: null,
        ownRevenueCents: noneR,
        ownExpenseCents: noneE,
        ownResultCents: noneR - noneE,
        rollupRevenueCents: noneR,
        rollupExpenseCents: noneE,
        rollupResultCents: noneR - noneE,
      });
    }

    let revenueCents = 0;
    let expenseCents = 0;
    for (const v of ownRevenue.values()) revenueCents += v;
    for (const v of ownExpense.values()) expenseCents += v;
    return {
      unitId: scope.unitId,
      definitionId: definition.id,
      definitionCode: definition.code,
      definitionName: definition.name,
      from: query.from ?? null,
      to: query.to ?? null,
      buckets,
      totals: { revenueCents, expenseCents, resultCents: revenueCents - expenseCents },
    };
  }

  // ── shared load + rollup ───────────────────────────────────────────────────
  private async load(scope: AccountingScope, query: DimensionReportQueryInput) {
    if (!this.policy.canReadDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler relatórios por dimensão.');
    }
    const definition = await this.dimensionRepo.findDefinitionById(scope, query.definitionId);
    if (!definition) throw new NotFoundError(`Eixo de dimensão '${query.definitionId}' não foi encontrado.`);

    const values = await this.dimensionRepo.findManyValues(scope, {
      definitionId: query.definitionId,
      includeArchived: true, // historical tags may point at an archived value — still report it
    });
    const accounts = await this.accountRepo.findManyByUnit(scope);
    const accountsById = new Map<string, Account>(accounts.map((a) => [a.id, a]));

    const totals: AccountDimensionTotals[] = await this.postingRepo.groupByAccountAndDimension(
      scope,
      LEDGER_STATUSES,
      {
        definitionId: query.definitionId,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      },
    );
    return { definition, values, accountsById, totals };
  }

  /**
   * Roll each value's own amount up into its ancestors via parentId. Returns rollup[valueId] =
   * own + Σ descendants. Cycle-safe by construction (createValue forbids cross-axis parents and a
   * cycle is impossible on create); a defensive visited-set caps any pathological chain.
   */
  private rollup(values: DimensionValue[], own: Map<string | null, number>): Map<string, number> {
    const byId = new Map<string, DimensionValue>(values.map((v) => [v.id, v]));
    const rollup = new Map<string, number>();
    for (const value of values) {
      // This value's OWN amount propagates up to itself and every ancestor.
      const amount = own.get(value.id) ?? 0;
      let current: DimensionValue | undefined = value;
      const visited = new Set<string>();
      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        rollup.set(current.id, (rollup.get(current.id) ?? 0) + amount);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
    }
    // ponytail: O(depth) walk per value; a materialized path would only pay off past ~10k values.
    return rollup;
  }
}
