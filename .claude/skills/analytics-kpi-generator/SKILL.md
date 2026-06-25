---
name: analytics-kpi-generator
description: Gera a camada BACKEND de um KPI do engine analítico — um `<Name>KpiProcessor.ts` (função pura single-pass sobre `rows`, devolvendo `ChartDataPoint[]`) + o `<Name>KpiTemplate.ts` com os params configuráveis, registrados via `registerProcessor` + `registerTemplate`. Use quando o pedido for "novo KPI", "processor de KPI", "métrica de receita/custo/vendas no backend", "calcular indicador sobre as rows", ou só a camada de analytics do server — SEM frontend. Termos-gatilho: KPI, processor, template, ChartDataPoint, single-pass, AnalyticsProcessor, addMoney, previousValue. Para a cadeia ponta-a-ponta (processor + hook + card no frontend) use `dashboard-kpi-end-to-end-generator`. Domínio/arquivos: `server/src/features/analytics/kpis/<category>/`.
argument-hint: "[NomeDoKpi] [categoria]"
allowed-tools: Read, Grep, Glob, Write, Edit
compatibility: Claude Code; requer o monorepo Luminaris (server/ com Prisma + tsc + o engine de analytics em server/src/features/analytics/core e os helpers em analytics/utils). Sem efeitos externos — apenas gera/edita arquivos no repositório.
metadata:
  governance-skill-id: "SKL-ANALYTICS-KPI"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "1.00"
---

# Analytics KPI Generator

## Purpose

Gera `<Name>KpiProcessor.ts` e `<Name>KpiTemplate.ts` seguindo o contrato `AnalyticsProcessor` do Luminaris. O processor executa em single-pass sobre os dados para performance máxima, e o template registra os parâmetros configuráveis.

## Contrato obrigatório

Antes de gerar, leia `.claude/skills/_ARCHITECTURE-CONTRACT.md` — as regras cross-cutting (camadas, no-`any`, soft-delete, money math, testes, verificação) são **gate** e não se repetem aqui. Esta skill adiciona apenas o checklist específico de **Analytics KPI**.

## Checklist obrigatório — Analytics KPI

Cada item com ID `[AKPI-NNN]` é uma REGRA DE GERAÇÃO auditável (mapeada a um eval gate em `governance.md`). Gere já em conformidade. Os itens sem ID são house-style recomendado (sem gate dedicado).

- [ ] **[AKPI-001] Single-pass → `ChartDataPoint[]`:** iterar `rows` (ou o stream de batches) **uma única vez**, acumulando todas as métricas no mesmo loop, e retornar `ChartDataPoint[]`. Assinatura: `export const <name>KpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => { ... }`. Múltiplos passes = FAIL.
- [ ] **[AKPI-002] Processor é função pura do `context`:** lê **só** o que vem em `context` (`rows`/`streamRows`, `params`, `table`) e devolve `ChartDataPoint[]`. **ZERO acesso a I/O direto** — nada de `import React`, nada de Express (`res.json`/`res.status`/`req`), nada de `prisma.*` direto (o engine entrega as `rows`; cross-fetch só via os helpers `context.fetchByPresetTableKey`). É backend-only, mas **não é a camada HTTP**.
- [ ] **[AKPI-003] Money como inteiro/centavos via `addMoney()` — nunca `+=`** (drift de ponto flutuante: `0.1 × 1000 ≠ 100`). Todo acumulador monetário só cresce por `addMoney`.
- [ ] **[AKPI-004] `previousValue` é `undefined` quando não há período anterior — NUNCA `0`.** Padrão: `previousValue: count > 0 ? total / count : undefined`. Tipe como `number | undefined`. Zero é um valor legítimo e mente sobre o delta.
- [ ] **[AKPI-005] Registrar em `kpis/<category>/index.ts`** com `registerProcessor('<key>', <name>KpiProcessor)` **e** `import './<Name>KpiTemplate'` (o template se auto-registra via `registerTemplate(<name>KpiTemplate)` no fim do próprio arquivo). Garantir `import './<category>'` em `kpis/index.ts` se a categoria for nova. Sem registro, o KPI é órfão (tsc verde, engine não o encontra).
- [ ] **Desestruturar `const { rows, params, table } = context`** — não acessar `context.x` esparso.
- [ ] **Excluir negativos e status configurados** dentro do loop: `if (amount <= 0) continue;` e `if (excludeStatuses.includes(status)) continue;`.
- [ ] **Usar os helpers do feature** — `DataSanitizer.extractCurrency()` para parsear valores, `DateUtils`/`getPeriodBoundaries()`/`isDateWithinWindow()` para janelas. Não reimplementar parsing/datas.
- [ ] **`referenceDate` com fallback:** `params.referenceDate ? new Date(params.referenceDate) : new Date()` — nunca `new Date()` cru.
- [ ] **Params lidos com `?? default` + cast explícito** (`const amountField = (params.amountField ?? 'totalAmount') as string`). **NÃO** usar `params || {}` nem destructure com default `= {}` — o TS infere `{}` e perde os tipos dos campos.
- [ ] **Validar finitude antes de acumular:** `Number.isFinite(amount)` — nunca somar `NaN`/`Infinity`.
- [ ] **Clampar inputs de domínio conhecido** antes da aritmética (ex.: percentuais `Math.min(100, Math.max(0, v))`) — dados legados passam pelo processor.
- [ ] **Cross-fetch (`fetchByPresetTableKey`) não engole erro** — `logger.warn('...', { presetTableKey, error })` antes de degradar para vazio; nunca `.catch(() => null)` silencioso.
- [ ] **Gerar o teste de regressão** (via `backend-test-suite-generator`) **com suíte Empty Safety** (rows vazios → `0` finito, nunca `NaN`) + Math + Float Safety.

## When to use

- Novo KPI de negócio precisa ser calculado (apenas backend: processor + template)
- Adicionando variante de KPI existente (por categoria, por período)
- Criando processor dinâmico para `analytics/dynamic/`

## When NOT to use

- **Pedido ponta-a-ponta** (processor backend **+** hook **+** card no frontend, "quero o KPI aparecendo no dashboard") → use `dashboard-kpi-end-to-end-generator` (sibling). Esta skill é **backend-only** — para aqui no template registrado, não gera React.

## Inputs

- `$ARGUMENTS[0]`: nome do KPI em PascalCase (ex: `TicketMedioPorPeriodo`)
- `$ARGUMENTS[1]`: categoria (ex: `revenue`, `cost`, `sales`, `custom`)

## Repository patterns to inspect first

```
server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts
server/src/features/analytics/kpis/revenue/RevenueKpiTemplate.ts
server/src/features/analytics/kpis/cashflow/CashflowKpiProcessor.ts
server/src/features/analytics/core/models/AnalyticsConfiguration.ts
server/src/features/analytics/utils/DateUtils.ts
server/src/features/analytics/utils/CurrencyUtils.ts
server/src/features/analytics/utils/DataSanitizer.ts
server/src/features/analytics/kpis/index.ts
```

## ⭐ Exemplo de referência canônico (espelhe este arquivo)

`server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts` — processor single-pass perfeito: desestrutura `const { rows, params, table }`, lê params com `?? default` + cast explícito, acumula dinheiro só via `addMoney()` (nunca `+=`), exclui `rawAmount <= 0`, valida `Number.isFinite`, usa `referenceDate` com fallback (`params.referenceDate ? new Date(...) : new Date()`), e define `previousValue` como `undefined` (não `0`) quando não há dado anterior. Pareie com o template `revenue/RevenueKpiTemplate.ts` e o registro em `revenue/index.ts` (re-exporta processor/template) + `kpis/index.ts`. Leia-o ANTES de gerar.

## Generation contract

### Processor

1. Arquivo: `server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts`
2. Tipo: `import type { AnalyticsProcessor, ChartDataPoint } from '../../core'`
3. Exportar: `export const <name>KpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => { ... }`
4. Desestruturar: `const { rows, params, table } = context`
5. Field mappings via params: `const amountField = params.amountField || 'totalAmount'`
6. Stream ou array:
   ```ts
   const stream = typeof context.streamRows === 'function'
     ? context.streamRows()
     : (async function* () { yield rows; })()
   ```
7. Single-pass: `for await (const batch of stream) { for (const row of batch) { ... } }`
8. Usar helpers: `DataSanitizer.extractCurrency()`, `addMoney()`, `getPeriodBoundaries()`, `isDateWithinWindow()`
9. Retornar: `ChartDataPoint[]` com `{ name, value, previousValue?, recordIds, tableSource, fullRecords? }`
10. `tableSource`: `(table as any).presetKey || params.tableId || '<category>'`
11. `referenceDate`: `const now = params.referenceDate ? new Date(params.referenceDate) : new Date()`
12. Clampar inputs com domínio conhecido antes de qualquer aritmética — ex.: percentuais via `Math.min(100, Math.max(0, value))`. Não confie só na validação upstream: dados legados/corrompidos passam pelo processor. É house-style (`cost`/`revenue` já clampam).
13. Em cross-fetch (`fetchByPresetTableKey`), NÃO engula erro com `.catch(() => null)` silencioso — logue com `logger.warn` (incluindo a presetTableKey e o erro) antes de degradar para vazio.
14. Centralize constantes: arrays de ordem de status (`['Draft','Sent',…]`), moedas e sentinelas (ex.: `999` p/ etapa sem `order`) vão num módulo de constantes do feature (`server/src/features/<x>/constants.ts`), não hardcoded e duplicados no processor. Para `.indexOf` aceitar string, use `[...CONST] as string[]`.

### Template

1. Arquivo: `server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts`
2. Tipo: `import type { AnalyticsTemplate } from '../../core/models'`
3. Campos: `key`, `name`, `description`, `processor` (string = key do `registerProcessor`), `requiredFields[]`, `optionalFields[]`
4. `requiredFields` usa `types: ['number']` (array, plural), `key`, `label`, `description`, `required`
5. No fim do arquivo, auto-registrar: `registerTemplate(<name>KpiTemplate)`

### Registro

1. No `index.ts` da **categoria** (`kpis/<category>/index.ts`):
   - `registerProcessor('<key>', <name>KpiProcessor)` (key = campo `processor` do template)
   - `import './<Name>KpiTemplate'` (o template se auto-registra via `registerTemplate`)
   - re-exportar processor e template
2. Garantir que `kpis/index.ts` (top-level) tem `import './<category>'` — se for uma categoria nova

### Teste

1. Arquivo: `server/src/features/analytics/kpis/<category>/__tests__/<Name>KpiProcessor.test.ts`
2. Mock rows com `data` object contendo os campos esperados
3. Verificar: valores calculados, período atual vs anterior, edge cases (0 rows, valores nulos)

## Files usually created or changed

```
server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts              ← NEW
server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts               ← NEW
server/src/features/analytics/kpis/<category>/__tests__/<Name>Processor.test.ts  ← NEW
server/src/features/analytics/kpis/index.ts                                       ← EDIT
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx jest features/analytics/kpis/<category> --passWithNoTests
```

## Anti-patterns

- Nunca faça múltiplos passes sobre os dados — tudo em single-pass por performance
- Não use `new Date()` diretamente — use `params.referenceDate ? new Date(params.referenceDate) : new Date()`
- Não ignore valores nulos/NaN — sempre validar com `Number.isFinite()` antes de acumular
- Não esqueça períodos: current window + previous window para cálculo de `previousValue`
- Não hardcode nomes de campos — sempre via `params.<field> || 'defaultFieldName'`
- Não confie só na validação upstream para inputs com domínio conhecido — clampe antes da aritmética (ex.: percentuais para `[0, 100]` via `Math.min`/`Math.max`), pois dados legados/corrompidos passam pelo processor (cost/revenue já clampam)
- Não engula erro de cross-fetch (`fetchByPresetTableKey`) com `.catch(() => null)` silencioso — logue com `logger.warn` antes de degradar para vazio
- Nunca acumule dinheiro com `+=` — use `addMoney()`; `+=` em floats produz drift (R$0,10 × 1000 ≠ R$100,00)
- Nunca defina `previousValue = 0` quando não há dados no período anterior — use `count > 0 ? total/count : undefined`; `0` mente sobre o delta
- Não leia params com `params || {}` nem destructure com default `= {}` — o TS infere `{}` e apaga os tipos dos campos; use `params.<field> ?? default` com cast explícito
- Não esqueça de registrar o processor/template no `index.ts` da categoria (e a categoria no `kpis/index.ts`) — KPI não-registrado é órfão (tsc verde, mas o engine não o encontra)
- Não entregue o processor sem o teste com suíte Empty Safety — rows vazios devem dar `0` finito, nunca `NaN`
