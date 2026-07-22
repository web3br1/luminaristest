import { ValidationError } from '../../../lib/errors';
import type { Prisma } from 'generated/prisma';
import type { IDimensionRepository } from '../repositories/IDimensionRepository';
import type { AccountingScope } from '../scope/AccountingScope';

/**
 * Shared dimension-tagging helpers (INCR-DIM / INCR-DIM-COMPLETENESS). Extracted so BOTH writers of
 * ORIGINAL economic content — PostingService.postEntry and EntryApprovalService (approve == post) —
 * resolve tags and enforce the requirement gate through the SAME code (reuse criterion; SEC-B1-1
 * "choke-point compartilhado"). A dimension is METADATA on a posting leg (ACC-024) — never enters
 * Σdébito=Σcrédito, the period gate, numbering, idempotency, or the audit hash-chain.
 */

/** A resolved dimension tag: the axis (definitionId) is DERIVED from the value, never trusted from input. */
export interface ResolvedDimensionTag {
  definitionId: string;
  valueId: string;
}

/**
 * Resolve + validate the dimension VALUE ids tagging one posting leg (ACC-024-026). For each value:
 * it must exist in scope, be ACTIVE, and be a LEAF (no active children — only analytic values are
 * taggable, D3, mirroring Account.acceptsEntries). The axis is DERIVED from the value (authoritative);
 * two values of the SAME axis on one leg are rejected here for a clear error (the
 * @@unique([postingId,definitionId]) is the in-tx backstop). Runs BEFORE the balance sum and writes
 * nothing that enters the ledger.
 */
export async function resolveLineDimensions(
  dimensionRepo: IDimensionRepository,
  scope: AccountingScope,
  valueIds: string[],
  tx?: Prisma.TransactionClient,
): Promise<ResolvedDimensionTag[]> {
  const tags: ResolvedDimensionTag[] = [];
  const axesSeen = new Set<string>();
  for (const valueId of valueIds) {
    const value = await dimensionRepo.findValueById(scope, valueId, tx);
    if (!value) {
      throw new ValidationError(`Valor de dimensão '${valueId}' não existe nesta unidade.`);
    }
    if (value.status !== 'ACTIVE') {
      throw new ValidationError(`Valor de dimensão '${value.code}' está arquivado e não pode etiquetar.`);
    }
    const activeChildren = await dimensionRepo.countActiveChildren(scope, valueId, tx);
    if (activeChildren > 0) {
      throw new ValidationError(
        `Valor de dimensão '${value.code}' não é analítico (tem filhos) — etiquete um valor-folha.`,
      );
    }
    if (axesSeen.has(value.definitionId)) {
      throw new ValidationError(
        'Uma partida não pode carregar dois valores do mesmo eixo de dimensão (ACC-025).',
      );
    }
    axesSeen.add(value.definitionId);
    tags.push({ definitionId: value.definitionId, valueId });
  }
  return tags;
}

/** One leg's requirement input for the completeness gate. */
export interface LegDimensionRequirement {
  accountCode: string;
  requiresDimension: boolean;
  dimensionCount: number;
}

/**
 * SEC-B1-1 — the mandatory-axis completeness gate (INCR-DIM-COMPLETENESS, ADR-INCR-DIM-COMPLETENESS
 * B1, EMENDA a ADR-INCR-DIM F5). Rejects a leg posted to an account with `requiresDimension=true`
 * that carries NO dimension tag. MVP = "exige QUALQUER eixo" (booleano simples, não por-eixo).
 *
 * Invoked INSIDE the tx (T6) by the two writers of NEW original economic content — postEntry and
 * approveEntry — so the rejection is rollback-safe and authoritative at commit. This is NOT a
 * rule engine (ADR §4): it is a flag-driven validation gate, the same class as the period gate
 * (INCR-1) and the leaf-account gate — it REJECTS a leg, it never GENERATES one.
 *
 * PROSPECTIVE by construction (SEC-B1-5): only original-content writers call it, so it can never
 * retro-reject a historical entry posted before the flag was set. reverseEntry does NOT call this —
 * a reversal only MIRRORS an already-accepted-or-historical entry (it copies the original's tags),
 * and hard-gating it would retro-reject the estorno of a legitimately-untagged historical leg,
 * violating SEC-B1-5 (ADR SEC-B1-2 explicitly sanctions exempting the reversal path).
 *
 * MACHINE-WRITER EXEMPTION (Council 1.7/N6): postEntry also SKIPS this gate for closing entries
 * (sourceType='closing') — the encerramento composes legs from aggregated balances (no per-leg
 * dimension fact exists) and gating it deadlocks the year-end close for any flagged result
 * account. Same class as the reversal exemption: derived content, not original economic content.
 */
export function assertLegDimensions(legs: LegDimensionRequirement[]): void {
  for (const leg of legs) {
    if (leg.requiresDimension && leg.dimensionCount === 0) {
      throw new ValidationError(
        `Conta '${leg.accountCode}' exige dimensão (centro de custo/projeto) — ` +
          'etiquete a partida com um valor de dimensão antes de postar.',
      );
    }
  }
}
