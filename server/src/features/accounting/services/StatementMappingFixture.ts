export const STATEMENT_MAPPING_VERSION = 'statement-mapping.v3';

/**
 * Declarative mapping rules for BP (Balanço Patrimonial) and DRE (Demonstração
 * do Resultado do Exercício). Matching order within each statement: rules with a
 * `codePrefix` are checked first (more specific), then nature-only rules.
 *
 * Sign conventions (applied to rawBalance = debitCents − creditCents):
 *   debit_positive  → amountCents =  rawBalance   (Asset: positive = have it)
 *   credit_positive → amountCents = −rawBalance   (Liability/Equity: positive = owe it)
 *   credit_negative → amountCents =  rawBalance   (Deductions: negative = reduce revenue)
 *   debit_negative  → amountCents = −rawBalance   (Expense: negative = cost)
 */
export const STATEMENT_MAPPING_RULES = [
  // ── Balanço Patrimonial ─────────────────────────────────────────────────
  { id: 'bp.assets',      statement: 'BP',  match: { nature: 'Asset' },                       section: 'assets',            sign: 'debit_positive',  order: 100 },
  { id: 'bp.liabilities', statement: 'BP',  match: { nature: 'Liability' },                   section: 'liabilities',       sign: 'credit_positive', order: 200 },
  { id: 'bp.equity',      statement: 'BP',  match: { nature: 'Equity' },                      section: 'equity',            sign: 'credit_positive', order: 300 },
  // ── DRE ─────────────────────────────────────────────────────────────────
  { id: 'dre.gross_rev',  statement: 'DRE', match: { nature: 'Revenue', codePrefix: '3.1' },  section: 'grossRevenue',      sign: 'credit_positive', order: 100 },
  // Receita de Revenda de Mercadorias (3.3, ADR-INCR-REVENUE-SPLIT) is ALSO gross revenue —
  // without this rule findMappingRule returns undefined and the DRE silently drops it, so the
  // income statement underreports and J150 diverges from I355 (closing closes 3.3 by nature).
  { id: 'dre.gross_rev_resale', statement: 'DRE', match: { nature: 'Revenue', codePrefix: '3.3' }, section: 'grossRevenue', sign: 'credit_positive', order: 105 },
  { id: 'dre.deductions', statement: 'DRE', match: { nature: 'Revenue', codePrefix: '3.2' },  section: 'revenueDeductions', sign: 'credit_negative',  order: 110 },
  // Custo das Mercadorias Vendidas (4.2, INCR-INVENTORY Body 2). MUST precede the nature-only
  // dre.expenses rule in this array so findMappingRule (first-match) routes 4.2 to costOfGoodsSold
  // instead of the generic expenses bucket — otherwise CMV would inflate expenses and the DRE would
  // report no cost of goods line. Same debit_negative sign as an expense (a cost reduces net).
  { id: 'dre.cogs',       statement: 'DRE', match: { nature: 'Expense', codePrefix: '4.2' },   section: 'costOfGoodsSold',   sign: 'debit_negative',   order: 250 },
  { id: 'dre.expenses',   statement: 'DRE', match: { nature: 'Expense' },                     section: 'expenses',          sign: 'debit_negative',   order: 300 },
] as const;

export type StatementMappingRule = (typeof STATEMENT_MAPPING_RULES)[number];
export type StatementId = 'BP' | 'DRE';

/** Returns the first matching rule for (row.nature, row.code, statement), or undefined. */
export function findMappingRule(
  nature: string,
  code: string,
  statement: StatementId,
): StatementMappingRule | undefined {
  return STATEMENT_MAPPING_RULES.find((r) => {
    if (r.statement !== statement) return false;
    if (r.match.nature !== nature) return false;
    if ('codePrefix' in r.match && !code.startsWith(r.match.codePrefix)) return false;
    return true;
  });
}

/** Applies the sign convention and returns a signed integer (cents). */
export function applySign(rawBalance: number, sign: StatementMappingRule['sign']): number {
  switch (sign) {
    case 'debit_positive':  return rawBalance;
    case 'credit_positive': return -rawBalance;
    case 'credit_negative': return rawBalance;
    case 'debit_negative':  return -rawBalance;
  }
}
