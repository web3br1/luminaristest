# INCR-4 Execution Brief — BP + DRE (Demonstrações Financeiras)

**Status:** Aguardando sanity check  
**Data:** 2026-06-27  
**Depends on:** INCR-3 merged (4e7c92d) — leitura idependente do INCR-3  
**ADR ratificado:** `docs/adr/ADR-INCR4-bp-dre.md`  
**Decision class:** READ_ONLY_REPORT — sem mutação de ledger, sem novo Model Prisma

---

## 1. Premissas invioláveis

| # | Regra |
|---|---|
| P1 | Nenhuma migração, nenhum DDL, nenhum `prisma generate`. Puro read-only. |
| P2 | Nenhum novo Service class. Tudo entra em `AccountingReportService` existente. |
| P3 | Nenhuma nova Factory entry. `getAccountingReportService()` já existe e injeta tudo. |
| P4 | `groupByAccount` recebe `options?: { from?: Date; to?: Date }` — chamada sem options é byte-idêntica à atual (nenhum WHERE date adicionado). |
| P5 | `trialBalance()` permanece byte-idêntico após extrair `getAccountBalances()` (refactor puro; suíte existente valida). |
| P6 | `from` ou `to` passados via query → `400 FROM_DATE_NOT_SUPPORTED_IN_INCR4` (param-aceito-e-ignorado = bug silencioso). |
| P7 | BP = posição `as_of` (toda a história até a data). DRE = `year_to_date` (1 Jan do ano de `asOf` até `asOf`). |
| P8 | Linha Resultado do Exercício no BP usa a MESMA janela temporal da DRE exibida; não pode vazar anos anteriores. |
| P9 | Conta com saldo e sem mapping → `INVALID` + listada em `diagnostics.unmappedAccounts`. Nunca ignorada silenciosamente. |
| P10 | Conta removida referenciada (natureza `'?'`) → `WARNING` + `diagnostics.removedAccountsReferenced`. |
| P11 | Agregado = `['Posted','Reversed']` — estorno neta a zero; jamais filtrar só `'Posted'`. |
| P12 | `mappingVersion: STATEMENT_MAPPING_VERSION` presente em TODOS os payloads (BP, DRE, trialBalance não precisa). |

---

## 2. Arquivo novo: `StatementMappingFixture.ts`

Caminho: `server/src/features/accounting/services/StatementMappingFixture.ts`

```typescript
export const STATEMENT_MAPPING_VERSION = 'statement-mapping.v1';

export const STATEMENT_MAPPING_RULES = [
  { id: 'bp.assets',      statement: 'BP',  match: { nature: 'Asset' },                        section: 'assets',             sign: 'debit_positive',  order: 100 },
  { id: 'bp.liabilities', statement: 'BP',  match: { nature: 'Liability' },                    section: 'liabilities',        sign: 'credit_positive', order: 200 },
  { id: 'bp.equity',      statement: 'BP',  match: { nature: 'Equity' },                       section: 'equity',             sign: 'credit_positive', order: 300 },
  { id: 'dre.gross_rev',  statement: 'DRE', match: { nature: 'Revenue', codePrefix: '3.1' },   section: 'grossRevenue',       sign: 'credit_positive', order: 100 },
  { id: 'dre.deductions', statement: 'DRE', match: { nature: 'Revenue', codePrefix: '3.2' },   section: 'revenueDeductions',  sign: 'credit_negative', order: 110 },
  { id: 'dre.expenses',   statement: 'DRE', match: { nature: 'Expense' },                      section: 'expenses',           sign: 'debit_negative',  order: 300 },
] as const;

export type StatementMappingRule = typeof STATEMENT_MAPPING_RULES[number];
```

**Convenção de sinal** (Q1):
- `debit_positive` → `amountCents = rawBalance` (debit − credit); positivo = ativo / destaca corretamente.
- `credit_positive` → `amountCents = creditCents − debitCents`; positivo = passivo/PL.
- `credit_negative` → `amountCents = −(creditCents − debitCents)`; deduções aparecem negativos.
- `debit_negative` → `amountCents = −rawBalance`; despesas aparecem negativas.

Valores monetários no payload como **string** (ADR: "valores monetários como string no payload").

**Matching order** (Q4 — accountId-first não necessário aqui pois não temos override por conta):
1. `codePrefix` (quando presente na regra) — `row.code.startsWith(rule.match.codePrefix)`
2. `nature` — `row.nature === rule.match.nature`
3. Primeira regra com menor `order` que satisfaça ambos os critérios vence.

---

## 3. Mudança em `IPostingRepository.ts` e `PostingRepository.ts`

**Interface** — adicionar `options?` ao `groupByAccount`:

```typescript
groupByAccount(
  scope: AccountingScope,
  statuses: string[],
  options?: { from?: Date; to?: Date },
): Promise<AccountPostingTotals[]>;
```

**Implementação** — filtro de data na `entry.date`:

```typescript
where: {
  ...accountingScopeWhere(scope),
  entry: {
    status: { in: statuses },
    ...(options?.from || options?.to
      ? { date: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
      : {}),
  },
},
```

Chamada sem `options` → sem cláusula `date` → identica à atual → `trialBalance` byte-idêntico (P4/P5).

---

## 4. Mudanças em `AccountingReportService.ts`

### 4a. Extrair `getAccountBalances()` (refactor)

```typescript
private async getAccountBalances(
  scope: AccountingScope,
  from?: Date,
  to?: Date,
): Promise<TrialBalanceRow[]> {
  const totals = await this.postingRepo.groupByAccount(
    scope,
    AccountingReportService.LEDGER_STATUSES,
    from || to ? { from, to } : undefined,
  );
  const accounts = await this.accountRepo.findManyByUnit(scope);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  return totals
    .map((t) => {
      const account = accountById.get(t.accountId);
      return {
        accountId: t.accountId,
        code: account?.code ?? '?',
        name: account?.name ?? '(conta removida)',
        nature: account?.nature ?? '?',
        debitCents: t.debitCents,
        creditCents: t.creditCents,
        balanceCents: t.debitCents - t.creditCents,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
```

`trialBalance()` passa a chamar `getAccountBalances(scope)` (sem datas) — byte-idêntico.

### 4b. Novos métodos públicos

- `async balanceSheet(scope, asOf: Date): Promise<BalanceSheetReport>`
- `async incomeStatement(scope, asOf: Date): Promise<IncomeStatementReport>`

#### `balanceSheet` — fluxo interno

1. `canRead(scope)` → `ForbiddenError` se falso.
2. Calcular `fromDateDre = new Date(asOf.getFullYear(), 0, 1)` (1 Jan do ano de asOf — UTC midnight).
3. `const allRows = await getAccountBalances(scope, undefined, asOf)` — BP = toda história até `asOf`.
4. `const dreRows = await getAccountBalances(scope, fromDateDre, asOf)` — mesma janela da DRE.
5. `const priorRows = await getAccountBalances(scope, undefined, new Date(asOf.getFullYear() - 1, 11, 31))` — resultado anterior (31 Dez do ano anterior).
6. Classificar `allRows` pelas regras BP (`statement:'BP'`).
7. Unmapped = rows com `nature !== '?'` que não matcharam nenhuma regra BP.
8. Removed = rows com `nature === '?'` e `|balanceCents| > 0`.
9. Calcular `netResultCents` = soma DRE (grossRevenue − deductions − expenses) via `dreRows`.
10. Calcular `hasUnclosedPriorYearResult` e `priorYearResultCents` via `priorRows` DRE net.
11. Injetar `netResultLine` como linha extra no payload (não altera as seções de equity — é linha computada separada).
12. `balanced = assetsCents === liabilitiesCents + equityCents + netResultCents` — igualdade inteira exata.
13. Montar `diagnostics`, `reportStatus`.

#### `incomeStatement` — fluxo interno

1. `canRead(scope)` → `ForbiddenError`.
2. `fromDate = new Date(asOf.getFullYear(), 0, 1)`.
3. `const dreRows = await getAccountBalances(scope, fromDate, asOf)`.
4. Classificar por regras DRE (`statement:'DRE'`).
5. Unmapped = rows com `nature` de receita/despesa (`Revenue`/`Expense`) sem match.
6. Calcular `netResult = grossRevenue − deductions − expenses`.
7. `hasUnclosedPriorYearResult` via `priorRows` (mesmo cálculo do BP).
8. Montar payload com `periodSemantics:'year_to_date'`, `fromDate`, `toDate`, `netResult`.

### 4c. Interfaces de payload (adicionar ao mesmo arquivo)

```typescript
interface DiagnosticsShape {
  mappingVersion: string;
  unmappedAccounts: Array<{ accountId: string; code: string; name: string; nature: string; balanceCents: number }>;
  removedAccountsReferenced: Array<{ accountId: string; balanceCents: number }>;
  hasUnclosedPriorYearResult: boolean;
  priorYearResultCents: number;
  warnings: string[];
}

interface BpDreLine {
  accountId: string;
  code: string;
  name: string;
  amountCents: string; // signed, string per ADR
}

interface StatementSection {
  accounts: BpDreLine[];
  totalCents: string;
}

export interface BalanceSheetReport {
  unitId: string;
  periodSemantics: 'as_of';
  asOf: string;        // ISO date
  mappingVersion: string;
  assets: StatementSection;
  liabilities: StatementSection;
  equity: StatementSection;
  netResultLine: { amountCents: string; isComputed: true; computation: 'income_statement_net_result'; fromDate: string; toDate: string };
  balanced: boolean;
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: DiagnosticsShape;
}

export interface IncomeStatementReport {
  unitId: string;
  periodSemantics: 'year_to_date';
  fromDate: string;    // ISO date (Jan 1 do ano de asOf)
  toDate: string;      // ISO date (= asOf)
  mappingVersion: string;
  grossRevenue: StatementSection;
  revenueDeductions: StatementSection;
  expenses: StatementSection;
  netResult: { amountCents: string; isComputed: true; computation: 'income_statement_net_result' };
  reportStatus: 'OK' | 'WARNING' | 'INVALID';
  diagnostics: DiagnosticsShape;
}
```

---

## 5. `PostingDto.ts` — DTOs novos

```typescript
export const BalanceSheetQuerySchema = z.object({
  unitId: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOf deve ser YYYY-MM-DD'),
  from: z.undefined().optional(),  // nunca aceito; se presente → 400
  to: z.undefined().optional(),
});

export const IncomeStatementQuerySchema = z.object({
  unitId: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'asOf deve ser YYYY-MM-DD'),
  from: z.undefined().optional(),
  to: z.undefined().optional(),
});
```

Alternativa mais idiomática: refinar `ReportQuerySchema` com `.refine()` que detecta `from`/`to` e rejeita com `FROM_DATE_NOT_SUPPORTED_IN_INCR4`. Verificar no controller qual key gerou o `400`.

---

## 6. Controller — dois novos handlers

```typescript
// getBalanceSheet
const parsed = BalanceSheetQuerySchema.safeParse(req.query);
// detectar from/to explícito antes de parsear → 400 if (req.query.from || req.query.to)
const asOf = new Date(parsed.data.asOf + 'T23:59:59Z'); // fim do dia UTC
const data = await getFactory().getAccountingReportService().balanceSheet(scope, asOf);
return res.json({ success: true, data });

// getIncomeStatement — idêntico, sem asOf end-of-day (já é year_to_date até asOf inclusive)
```

**Proteção from/to explícito:** verificar `req.query.from || req.query.to` ANTES do parse e retornar `400 { error:'FROM_DATE_NOT_SUPPORTED_IN_INCR4' }` imediatamente.

---

## 7. `routes/accounting.ts` — 2 rotas novas

```typescript
router.get('/balance-sheet', getBalanceSheet);
router.get('/income-statement', getIncomeStatement);
```

Registrar ANTES de qualquer rota com parâmetro (`:unitId`, `:id`) para evitar clash.

---

## 8. Testes obrigatórios

Arquivo: `server/src/features/accounting/services/__tests__/AccountingReportService.bp-dre.test.ts`

| Grupo | Casos |
|---|---|
| **Refactor guard** | `trialBalance` suíte existente permanece verde (byte-idêntico) |
| **BP balanceado** | Ativo=PL via receita simples → `balanced=true`, `reportStatus:'OK'` |
| **BP não-balanceado forçado** | Fixture com mapping errado/linha omitida → `balanced=false`, `INVALID` |
| **Classificação por seção** | Partida dobrada perfeita pode balancear com classificação ruim → teste que separa assets/liabilities/equity |
| **Estorno neta zero** | Posted+Reversed ambos no agregado → seção mostra zero. Provar que só Posted daria errado. |
| **Dedução (3.2)** | Receita 3.2 aparece negativa em `revenueDeductions` |
| **Despesa** | Expense aparece negativa em `expenses` |
| **netResultLine** | Janela idêntica à DRE exibida (não vaza ano anterior) |
| **hasUnclosedPriorYearResult** | DRE prior year ≠ 0 → `true` + `priorYearResultCents` correto |
| **Conta sem mapping** | `nature='Asset'` sem codePrefix → OK; `nature='CustomX'` → `INVALID`+`unmappedAccounts` |
| **Conta removida** | `nature='?'` + saldo > 0 → `WARNING`+`removedAccountsReferenced` |
| **from/to → 400** | `?asOf=…&from=…` → `FROM_DATE_NOT_SUPPORTED_IN_INCR4` (controller-level) |
| **mappingVersion** | Presente em todo payload BP e DRE |
| **year_to_date** | DRE `fromDate` = 1 Jan do ano de `asOf`; não inclui anos anteriores |

---

## 9. Ordem de implementação

1. `StatementMappingFixture.ts` (nova, zero deps, pura)
2. `IPostingRepository.ts` — adicionar `options?` a `groupByAccount`
3. `PostingRepository.ts` — implementar filtro de data
4. `AccountingReportService.ts` — extrair `getAccountBalances()` + interfaces + `balanceSheet()` + `incomeStatement()`
5. `PostingDto.ts` — dois DTOs novos
6. `accountingController.ts` — `getBalanceSheet`, `getIncomeStatement`
7. `routes/accounting.ts` — 2 rotas
8. `__tests__/AccountingReportService.bp-dre.test.ts`
9. `cd server && npx tsc --noEmit` limpo
10. `cd my-app && npx tsc --noEmit` limpo
11. `jest --runInBand` — full suite
12. `npm run docs:generate`
13. Reviewer independente (worktree isolado)
14. Commit só após reviewer PASS

---

## 10. Sanity check — 13 itens do diretor

| # | Item | Resposta |
|---|---|---|
| 1 | READ_ONLY_REPORT, sem mutation de ledger | ✅ P1 — sem `create`/`update`/`delete`, sem tx |
| 2 | Sem model Prisma novo | ✅ P1 — 0 migrations, 0 DDL |
| 3 | Sem factory/service novo desnecessário | ✅ P2/P3 — tudo em `AccountingReportService`; factory inalterada |
| 4 | BP usa `asOf` | ✅ §6/§4b — `as_of` semântica, endpoint `?asOf=` |
| 5 | DRE usa `year_to_date`, não cumulative genérico | ✅ §4b — `fromDate = 1 Jan do ano de asOf` computado no servidor |
| 6 | `from/to` não aceitos se forem ignorados | ✅ P6/§6 — controller detecta e retorna `400 FROM_DATE_NOT_SUPPORTED_IN_INCR4` |
| 7 | Resultado computado no PL usa a mesma janela temporal da DRE | ✅ P8/§4b — `dreRows` usado tanto para `netResultLine` do BP quanto para `incomeStatement` |
| 8 | `diagnostics`/`reportStatus` existem | ✅ §4c — `DiagnosticsShape` completa, `reportStatus: 'OK'\|'WARNING'\|'INVALID'` |
| 9 | Contas sem mapping/removidas não são ignoradas silenciosamente | ✅ P9/P10 — listadas em `diagnostics`, promovem `INVALID`/`WARNING` |
| 10 | Mapping fixture declarativa com `codePrefix`+`nature` | ✅ §2 — `STATEMENT_MAPPING_RULES` com matching order explícito |
| 11 | `mappingVersion` em todo payload | ✅ §4c/§8 — campo presente em `BalanceSheetReport` e `IncomeStatementReport` |
| 12 | Agregado inclui Posted + Reversed para estorno netar | ✅ P11 — `LEDGER_STATUSES = ['Posted','Reversed']`; teste de estorno obrigatório |
| 13 | `trialBalance` permanece byte-idêntico após refactor | ✅ P5/§4a — `getAccountBalances(scope)` sem datas → query idêntica; suíte existente valida |
