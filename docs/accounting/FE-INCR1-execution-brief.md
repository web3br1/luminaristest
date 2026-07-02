# FE-INCR-1 Execution Brief — Accounting Frontend Minimum

**Status:** Aguardando sanity check  
**Branch:** `feat/accounting-frontend-minimum`  
**Data:** 2026-06-30  
**Depende de:** INCR-1..4 merged em `main` (bb6f6da)

---

## Estado atual do frontend accounting

O módulo **já existe**. Não partir do zero — estender.

```
my-app/
├─ pages/accounting/index.tsx          → renderiza <AccountingView />
├─ features/accounting/
│  ├─ AccountingView.tsx               → shell: unit selector + 3 tabs
│  ├─ hooks/useAccountingData.ts       → carrega units + trialBalance
│  ├─ lib/formatCents.ts               → centavos → "R$ 1.234,56"
│  └─ components/
│     ├─ TrialBalanceTable.tsx         → balancete read-only
│     ├─ JournalEntriesPanel.tsx       → lista de lançamentos + estorno
│     ├─ JournalEntryModal.tsx         → form de novo lançamento
│     └─ ChartOfAccountsPanel.tsx      → plano de contas
└─ lib/services/accounting.service.ts  → wrapper tipado sobre /api/accounting/*
```

**Tabs existentes:** Balancete | Lançamentos | Plano de Contas

**Tabs a adicionar:** Períodos | Razão | BP | DRE

---

## Perguntas do brief — respostas

### 1. Quais telas entram no mínimo?

Não são telas novas — são **4 tabs novos** dentro do `AccountingView.tsx` existente:

| Tab | Componente novo | Endpoints |
|-----|----------------|-----------|
| **Períodos** | `PeriodsPanel.tsx` | `GET /{unitId}/periods`, `POST /{unitId}/periods/seed-year`, `POST /periods/{id}/open\|soft-close\|hard-close\|reopen` |
| **Razão** | `LedgerPanel.tsx` | `GET /ledger?unitId=&accountCode=` (já no serviço) |
| **BP** | `BalanceSheetPanel.tsx` | `GET /balance-sheet?unitId=&asOf=` (INCR-4) |
| **DRE** | `IncomeStatementPanel.tsx` | `GET /income-statement?unitId=&asOf=` (INCR-4) |

Tab order final: **Balancete | Períodos | Lançamentos | Razão | Plano de Contas | BP | DRE**

---

### 2. Quais endpoints existentes serão consumidos?

**Já no serviço (nenhuma mudança necessária além de tipos):**
- `GET /accounting/trial-balance?unitId=` — Balancete (já funciona)
- `GET /accounting/entries?unitId=&page=&limit=` — Lançamentos (já funciona)
- `GET /accounting/ledger?unitId=&accountCode=` — Razão (já no serviço, sem panel)
- `GET /accounting/accounts?unitId=` — Plano + seletor Razão

**A adicionar ao serviço:**
- `GET /accounting/{unitId}/periods?year=` — lista períodos do ano
- `POST /accounting/{unitId}/periods/seed-year` — semear 12 períodos FUTURE
- `POST /accounting/periods/{id}/open` — abrir período
- `POST /accounting/periods/{id}/soft-close` — fechar parcial
- `POST /accounting/periods/{id}/hard-close` — fechar definitivo
- `POST /accounting/periods/{id}/reopen` — reabrir (apenas SOFT_CLOSED)
- `GET /accounting/balance-sheet?unitId=&asOf=` — BP
- `GET /accounting/income-statement?unitId=&asOf=` — DRE

**Correção de regressão no serviço:**
- `ReverseEntryPayload` está incompleto — falta `reversalPostingDate: string` (obrigatório no backend desde INCR-3)
- `JournalEntry` está incompleto — falta `fiscalYear: number` e `entryNumber: number`

---

### 3. Quais ações ficam read-only?

| Ação | Status |
|------|--------|
| Visualizar balancete | Read-only ✅ |
| Visualizar lançamentos | Read-only ✅ |
| Visualizar razão (ledger) | Read-only ✅ |
| Visualizar plano de contas | Read-only, mas *criar/deletar conta* já existe como mutation ✅ |
| Visualizar BP | Read-only ✅ |
| Visualizar DRE | Read-only ✅ |
| Gerenciar períodos (seed + transições) | Mutation via endpoints existentes — **dentro do escopo** |
| Novo lançamento (modal) | Mutation já existente — **mantido** |
| Estorno | Mutation já existente — **mantido** (corrigir `reversalPostingDate`) |

---

### 4. Como o usuário escolhe unitId?

Já resolvido: dropdown "Unidade" no header de `AccountingView.tsx`, carregado por `useAccountingData.ts` via `DynamicTableService`. **Sem alteração necessária.**

---

### 5. Como períodos OPEN/FUTURE/SOFT_CLOSED/HARD_CLOSED aparecem na UI?

**`PeriodsPanel`** — layout:

```
[Ano: 2026 ▼]   [Semear ano]

Jan  Fev  Mar  Abr  Mai  Jun  Jul  Ago  Set  Out  Nov  Dez
[OPEN]  [OPEN]  [FUTURE]  ...

Cada chip de mês:
- FUTURE      → chip cinza + botão "Abrir"
- OPEN        → chip verde + botão "Fechar parcial" + "Fechar definitivo"
- SOFT_CLOSED → chip âmbar + botão "Reabrir" + "Fechar definitivo"
- HARD_CLOSED → chip vermelho (sem ação — terminal)
```

- Ano controlado por estado local (`useState<number>`, default `new Date().getFullYear()`)
- Seed year: só exibido quando não há períodos para o ano selecionado
- Transições bloqueadas: `HARD_CLOSED` → nenhum botão, chip "Definitivamente fechado"
- Confirmação: `softClose`/`hardClose` pede `reason` via input inline (não modal)

---

### 6. Como BP/DRE mostram periodSemantics?

**`BalanceSheetPanel`:**
```
[asOf: 2026-06-30 ▼]   [Atualizar]

Período: posição em 30/06/2026 (as_of)    [OK ✓] / [AVISO ⚠] / [INVÁLIDO ✗]

Ativo Total:      R$ 50.000,00
Passivo Total:    R$ 20.000,00
PL Total:         R$ 28.000,00
Resultado Exerc:  R$ 2.000,00  (calculado, 01/01/2026–30/06/2026)
─────────────────────────────
Equilíbrio:       ✓ Balanceado / ✗ Desbalanceado
```

**`IncomeStatementPanel`:**
```
[asOf: 2026-06-30 ▼]   [Atualizar]

Período: 01/01/2026 a 30/06/2026 (year_to_date)    [OK ✓]

Receita Bruta:      R$ 5.000,00
(-) Deduções:      -R$ 500,00
(-) Despesas:      -R$ 2.500,00
───────────────────────────────
Resultado Líquido:  R$ 2.000,00  (calculado)
```

- `asOf` padrão: hoje (`new Date().toISOString().slice(0, 10)`)
- `periodSemantics` exibido como badge/label contextual (não número cru)
- `mappingVersion` exibido em tooltip no badge de status

---

### 7. Como diagnostics/reportStatus aparecem?

```tsx
// Acima das seções do relatório:
{reportStatus === 'INVALID' && (
  <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
    <strong>Contas sem mapeamento com saldo:</strong>
    {unmappedAccounts.map(a => <div key={a.code}>{a.code} — {a.name} ({formatCents(a.balanceCents)})</div>)}
  </div>
)}
{reportStatus === 'WARNING' && (
  <div className="...amber...">
    {warnings.map((w, i) => <div key={i}>{w}</div>)}
  </div>
)}
```

- `OK` → nenhum banner
- `WARNING` → banner âmbar (contas removidas, resultado anterior não encerrado)
- `INVALID` → banner vermelho (contas sem mapeamento)
- `hasUnclosedPriorYearResult` → warning específico: "Resultado do exercício anterior não encerrado (R$ X)"

---

### 8. Como entryNumber/display é apresentado?

Na coluna de lançamentos (`JournalEntriesPanel`):

- Formato: `{fiscalYear}/{entryNumber.toString().padStart(4, '0')}` → `2026/0001`
- Se `entryNumber === null` (lançamentos pré-INCR-3): `—`
- Mostrar como coluna adicional antes de "Data"

Requer atualização do tipo `JournalEntry` no serviço para incluir `fiscalYear: number | null` e `entryNumber: number | null`.

---

### 9. Como erros ACCOUNTING_PERIOD_NOT_OPEN aparecem?

O `apiClient` já emite `notify()` automático em erros. Mas o modal de novo lançamento precisa de tratamento adicional:

- Capturar erro com `code: 'ACCOUNTING_PERIOD_NOT_OPEN'` na resposta
- Exibir mensagem inline no modal: "O período para a data selecionada está fechado. Verifique a aba Períodos."
- Link/botão que navega para a aba "Períodos" (via callback `onNavigateToPeriods`)
- Para outros erros: toast via `apiClient` já funciona

---

### 10. O que fica explicitamente fora do escopo?

```text
❌ Novo domínio backend
❌ Mutations novas no ledger (além das já existentes)
❌ Conciliação, anexos, evidências
❌ ECD/ECF, importação/exportação
❌ DRE com range from/to (só year_to_date por enquanto)
❌ Edição/renumeração de lançamentos
❌ Multiempresa / multi-ledger
❌ Exportação PDF/Excel dos relatórios
❌ Filtros avançados nos lançamentos (por conta, por período)
❌ Auditoria UI (sem endpoint listável ainda)
❌ Gráficos / KPIs visuais nos relatórios
```

---

## Premissas invioláveis

| # | Regra |
|---|---|
| P1 | Nenhum novo modelo Prisma, nenhuma migration, nenhum endpoint backend novo |
| P2 | Service extension apenas — não criar novo arquivo de serviço |
| P3 | `neutral-*` nunca `zinc-*`; cards `rounded-2xl/3xl`; zero `any` evitável |
| P4 | Telas atrás de `withAuth` (ou `useAuth()` como já feito em `pages/accounting/index.tsx`) |
| P5 | `ReverseEntryPayload.reversalPostingDate` adicionado como fix de regressão |
| P6 | `JournalEntry.entryNumber` e `fiscalYear` tipados como `number | null` (retrocompatível) |
| P7 | `my-app tsc --noEmit` e `npm run build` limpos são gates |
| P8 | Server `jest 604/604` permanece verde (zero backend alterado) |

---

## Mapeamento endpoints → componentes

| Endpoint | Componente | Método serviço |
|----------|------------|----------------|
| `GET /{unitId}/periods` | `PeriodsPanel` | `listPeriods(unitId, year)` |
| `POST /{unitId}/periods/seed-year` | `PeriodsPanel` | `seedYear(unitId, year)` |
| `POST /periods/{id}/open` | `PeriodsPanel` | `openPeriod(id, unitId)` |
| `POST /periods/{id}/soft-close` | `PeriodsPanel` | `softClosePeriod(id, unitId, reason)` |
| `POST /periods/{id}/hard-close` | `PeriodsPanel` | `hardClosePeriod(id, unitId, reason)` |
| `POST /periods/{id}/reopen` | `PeriodsPanel` | `reopenPeriod(id, unitId, reason)` |
| `GET /ledger` | `LedgerPanel` | `getAccountLedger(query)` (já existe) |
| `GET /balance-sheet` | `BalanceSheetPanel` | `getBalanceSheet(query)` |
| `GET /income-statement` | `IncomeStatementPanel` | `getIncomeStatement(query)` |

---

## Ordem de implementação

```
1. accounting.service.ts — corrigir ReverseEntryPayload + JournalEntry + add period/BS/IS types+methods
2. PeriodsPanel.tsx — list + year selector + seed-year + transitions
3. LedgerPanel.tsx — account selector + ledger table + running balance
4. BalanceSheetPanel.tsx — asOf picker + sections + diagnostics
5. IncomeStatementPanel.tsx — asOf picker + sections + diagnostics
6. AccountingView.tsx — adicionar 4 tabs ao TABS array + renderizar novos panels
7. JournalEntriesPanel.tsx — adicionar coluna entryNumber (minor update)
8. cd my-app && npx tsc --noEmit
9. cd my-app && npm run build
10. cd server && npx jest --no-coverage
11. Reviewer independente (worktree isolado)
12. PR → main
```

---

## Gate mínimo de aceite

```text
[✓] my-app tsc limpo
[✓] frontend build PASS (next build)
[✓] server tsc/tests continuam verdes (604/604)
[✓] nenhuma mutation backend nova
[✓] todos endpoints consumidos existem no OpenAPI (bb6f6da)
[✓] BP mostra asOf + periodSemantics:'as_of'
[✓] DRE mostra year_to_date + fromDate computado
[✓] diagnostics visíveis (unmapped→INVALID, removed→WARNING)
[✓] períodos HARD_CLOSED sem ação, OPEN com botão "Fechar"
[✓] entryNumber aparece como YYYY/NNNN ou "—" para legacy
[✓] ACCOUNTING_PERIOD_NOT_OPEN mensagem inline no modal
[✓] ReverseEntryPayload.reversalPostingDate corrigido
[✓] reviewer independente PASS
[✓] PR aberto para main
```
