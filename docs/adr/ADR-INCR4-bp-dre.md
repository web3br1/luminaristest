# ADR-INCR4 — Demonstrações BP + DRE

- **Status:** Accepted with amendments (ratificado 2026-06-27) — as emendas §"Emendas obrigatórias" PREVALECEM
- **Date:** 2026-06-27
- **Decision class:** READ_ONLY_REPORT (sem mutação de ledger, sem model Prisma)
- **Depends on:** módulo accounting em `main`; independe de INCR-1/2/3 (read-only)
- **Plano:** `docs/accounting/PLANEJAMENTO-buildout-contabil.md` §3 INCR-4

## Context

Só existem balancete + razão. BP e DRE são reclassificações do agregado `groupByAccount(scope,
['Posted','Reversed'])`. Direção aprovada; **ratificação condicionada às 9 emendas.** Base
normativa: CPC 26 — BP é posição **ao final do período**; DRE é resultado **do período**
(receitas − despesas). A semântica temporal não pode ser ambígua.

## Decisão ratificada (com emendas)

| # | Questão | Decisão |
|---|---|---|
| Q1 | Sinal | Saldo natural por nature, **com payload assinado** (`amountCents` signed) **OU** `presentationRole` explícito (`deduction`/`expense`). Escolher uma convenção e testar. Internamente `rawBalance = debit−credit`. |
| Q2 | Resultado | Linha computada injetada no PL, sem conta/lançamento, **calculada com a MESMA janela temporal da DRE exibida**; `isComputed:true` + `fromDate/toDate` + `computation:'income_statement_net_result'`. **Diagnóstico** avisa resultado anterior não encerrado. |
| Q3 | Semântica de período | **NÃO aceitar `from/to` e ignorar.** **BP = `as_of`** (`?asOf=`); **DRE = `year_to_date`** (`fromDate=01-01 do ano de asOf`, `toDate=asOf`). `from` não suportado → `400 FROM_DATE_NOT_SUPPORTED_IN_INCR4`. |
| Q4 | Mapeamento | Fixture versionada por **regras declarativas** (`match` por `codePrefix`+`nature`, com `order`), **não** `Record<AccountNature,...>` puro nem `switch` inline. Matching: accountId → codePrefix → nature → fallback. |
| Q5 | Agregado | `['Posted','Reversed']` com **teste de estorno netando a zero**. (Futuro: filtrar por `accountingEffect`, não por status.) |
| Q6 | Diagnostics | BP/DRE retornam `diagnostics` (`unmappedAccounts`, `removedAccountsReferenced`, `warnings`, `hasUnclosedPriorYearResult`) + `reportStatus: OK|WARNING|INVALID`. |
| Q7 | Conta sem mapping/removida | Com saldo → `WARNING`/`INVALID`, **nunca ignorada silenciosamente**. `balanced` não mascara ausência de mapping. |
| Q8 | Refactor | `getAccountBalances()` extraído deixa `trialBalance` **byte-idêntico** (preserva `.sort(code)` + fallbacks `'?'`/`'(conta removida)'`). |
| Q9 | Endpoints | Inglês kebab-case com **parâmetros semânticos**: `balance-sheet?asOf=`, `income-statement?asOf=`. |

## Emendas obrigatórias (bloqueantes)

1. **Não aceitar `from/to` se forem ignorados** (param aceito-e-ignorado = bug silencioso).
2. **BP = `as_of`** (posição em uma data).
3. **DRE do INCR-4 = `year_to_date`**, não "cumulative" genérico.
4. **Resultado calculado na mesma janela da DRE** exibida (senão a linha "Resultado do Exercício" fica conceitualmente errada com receitas/despesas de anos anteriores).
5. **Diagnóstico de resultado anterior não encerrado** (`hasUnclosedPriorYearResult`).
6. **Mapeamento por regras declarativas** (`codePrefix`+`nature`) — `nature` puro não separa receita bruta/deduções/custo/financeiro nem contra-receita 3.2.
7. **`diagnostics` para contas sem mapping/removidas**; `reportStatus`.
8. **Teste de estorno** com `Posted+Reversed` netando a zero.
9. **`trialBalance` byte-idêntico** após extrair `getAccountBalances()`.

## Modelo ratificado (sem Prisma)

```ts
export const STATEMENT_MAPPING_VERSION = "statement-mapping.v1";
export const STATEMENT_MAPPING_RULES = [
  { id:"bp.assets",      statement:"BP",  match:{nature:"Asset"},                 section:"assets",            sign:"debit_positive",  order:100 },
  { id:"bp.liabilities", statement:"BP",  match:{nature:"Liability"},             section:"liabilities",       sign:"credit_positive", order:200 },
  { id:"bp.equity",      statement:"BP",  match:{nature:"Equity"},                section:"equity",            sign:"credit_positive", order:300 },
  { id:"dre.gross_rev",  statement:"DRE", match:{nature:"Revenue", codePrefix:"3.1"}, section:"grossRevenue",  sign:"credit_positive", order:100 },
  { id:"dre.deductions", statement:"DRE", match:{nature:"Revenue", codePrefix:"3.2"}, section:"revenueDeductions", sign:"credit_negative", order:110 },
  { id:"dre.expenses",   statement:"DRE", match:{nature:"Expense"},               section:"expenses",          sign:"debit_negative",  order:300 },
] as const;
```

`reportStatus: 'OK'|'WARNING'|'INVALID'`; `diagnostics: { mappingVersion, unmappedAccounts[],
removedAccountsReferenced[], hasUnclosedPriorYearResult, priorYearResultCents, warnings[] }`.
`balanced = (assetsCents === liabilitiesCents + equityCents)` igualdade inteira exata.
Tudo em centavos; valores monetários como **string** no payload.

## Endpoints

```
GET /api/accounting/balance-sheet?asOf=2026-06-30      → periodSemantics:'as_of'
GET /api/accounting/income-statement?asOf=2026-06-30   → periodSemantics:'year_to_date', fromDate=2026-01-01
GET /api/accounting/income-statement?from=...          → 400 FROM_DATE_NOT_SUPPORTED_IN_INCR4
```

Futuro (DRE por competência): `?from&to` → `periodSemantics:'range'`.

## Testes obrigatórios

- BP balanceado: caso receita simples (Ativo=PL via resultado); despesa (Ativo/-PL negativos); receita+dedução (líquida).
- Forçado-false: fixture com mapping errado/linha omitida → `balanced=false`/`INVALID`. **+ testes de classificação por seção** (partida dobrada perfeita pode balancear com classificação ruim).
- Estorno: `Posted+Reversed` neta a zero; provar que só `Posted` daria errado.
- Diagnostics: conta sem mapping com saldo → `INVALID`; conta removida referenciada → `WARNING`.
- Resultado anterior não encerrado → `hasUnclosedPriorYearResult=true`.
- Refactor: suíte `trialBalance` existente verde (guarda byte-idêntico).
- mappingVersion presente em todo payload; mudança no mapping exige bump.

## Checklist de ratificação (revisado)

- [ ] Q1 Sinal saldo-natural, payload assinado OU `presentationRole`
- [ ] Q2 Resultado computado na mesma janela da DRE; `isComputed`+`fromDate/toDate`
- [ ] Q2.1 Diagnóstico de resultado anterior não encerrado
- [ ] Q3 BP=`as_of`, DRE=`year_to_date`; `from/to` não aceito se ignorado
- [ ] Q4 Mapping por regras declarativas (`codePrefix`+`nature`)
- [ ] Q4.1 `mappingVersion` em todo payload; mudança exige bump
- [ ] Q5 Agregado `Posted+Reversed` com teste de estorno
- [ ] Q6 `diagnostics` + `reportStatus`
- [ ] Q7 Conta sem mapping/removida nunca ignorada silenciosamente
- [ ] Q8 `getAccountBalances` preserva `trialBalance` byte-idêntico
- [ ] Q9 Endpoints com parâmetros semânticos (`asOf`)
