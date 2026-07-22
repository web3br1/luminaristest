# Teste de Sistema — Rodada 2 (+ Rodada 3 blind)

**Data:** 2026-07-08 · **Alvo:** NC-2 (a única não-conformidade aberta da rodada 1, que fechou 9/10)
**Pipeline exercitado:** `luminaris-orchestrator → luminaris-implementer → luminaris-reviewer`, cada agente em contexto fresco / worktree isolado.

## Objetivo

A rodada 1 desviou de propósito do *trap de output-shape* do `formatDate`. A rodada 2 bateu exatamente nesse ponto cego: um veículo sintético que força uma decisão de formatação de data numa superfície de frontend nova, rodado pelo pipeline completo, para scorar se os gates distinguem as vias divergentes de `formatDate` — em vez de tratar como "clone jaccard 1.0, consolide".

## Veículo

Widget descartável `RecentActivityFeed` (lista de itens datados, coluna de data em dd/mm/aaaa), alimentado por um hook **date-only** (`useRecentActivity` → `date: "2026-07-08"`) — o caso discriminante que dispara o UTC-shift. Worktree isolado em `main@842aa41`; veículo nunca mergeado.

## Gabarito (ground truth, confirmado por leitura — CBM-001)

`formatDate` é uma divergência de **4 vias**, com dois eixos **ortogonais** (shape × date-only-safety) e **nenhum canônico com os dois**:

| Impl | Numérico dd/mm/aaaa? | Date-only-safe? |
|---|---|---|
| `shared/utils/formatters.formatDate({dateOnly})` | ❌ long-form (`month:'short'`) | ✅ |
| `shared/utils/formatters.formatDateBR` | ✅ | ❌ `new Date(string)` cru |
| `accounting/lib/formatDate` | ✅ | ✅ (mas feature-scoped) |
| `crm/lib/dates.formatDate` | ✅ (locale default) | ❌ UTC-buggy |

**Resposta correta:** reusar/promover um canônico numérico + date-only-safe. **Errado:** canônico long-form (shape), `formatDateBR` cru (UTC bug), clonar CRM, ou `new Date(iso).toLocaleDateString()` fresco.

## Scorecard

| Gate | O que testa | Resultado |
|---|---|---|
| **G1** (orchestrator) | emite instrumentação anti-ilha (cbm-evidência, `_REUSE-CRITERION`, marca de ilha, design-system) | **PASS** (4/4) — e *engajou* o output-shape trap que a rodada 1 desviou |
| FASE 2 (implementer, obs) | navega o trap | **correto** — reusou canônico `formatDateBR` + normalizou `T00:00:00` → `08/07/2026`, sem shift |
| **G2** (reviewer, código são) | precisão — sem falso-positivo | **PASS** — aprovou corretamente, executando a cadeia sob `TZ=America/Sao_Paulo` |
| **G3** (reviewer, bug injetado) | sensibilidade — pega o UTC-shift | **PASS** — reprovou (FAIL), confirmação empírica; bônus: pegou o widget órfão |
| **Rodada 3 — blind** | reviewer com prompt **genérico** (sem pista de data) pega o bug? | **PASS** — pegou o off-by-one **sozinho** (07/07, 06/07, 30/06), fechando o confound do G3 |

## Veredito NC-2

**FECHADA.** O pipeline trata reuse + shape + UTC-safety end-to-end; o reviewer pega o bug quando presente — inclusive **sem ser apontado pra data** (rodada 3). A caracterização original da rodada 1 ("pipeline clona/erra o formatDate, output-shape dodged") não se sustenta mais.

## Achados residuais (o tail mais afiado que a rodada rendeu)

1. **`formatDate` é 4-vias, não clone de 3-vias.** Shape e date-only-safety são ortogonais e nenhum canônico tem os dois → "reuse o canônico" é genuinamente ambíguo. **Resolvido:** PR #50 promove `formatDateNumericBR` (numérico + date-only-safe) e faz `formatDateBR` + `accounting/lib/formatDate` delegarem.
2. **Os gates são cegos a *técnica re-inlinada*.** O implementer re-inlinou a normalização `T00:00:00` em vez de reusar um símbolo — a 5ª ocorrência inline da mesma técnica — e os dois reviewers chamaram de "necessário, não é ilha". A detecção de clone pega *função* duplicada, não *técnica* copiada inline. O fix do item 1 cria o símbolo reusável que fecha isto.

## Encaminhamentos

- **PR #50** — `formatDateNumericBR` canônico + delegações (review independente PASS, CI verde). CRM deixado de propósito (migrar = mudança de locale; Etapa 2).
- **Follow-ups (chips):** (a) wire vitest no CI de frontend + TZ-pin (a guarda de off-by-one hoje é local-only, não roda em CI); (b) migrar os sites date-only-buggy remanescentes (CRM `LeadTasksPanel` — bug confirmado — e `finance/utils/formatters.formatDateBR`) ao canônico.

## Ressalva honesta (T8)

O G3 da rodada 2 foi parcialmente *primed* (o prompt de reviewer enfatizou "trace date handling"). A **rodada 3 blind fechou esse confound**: com prompt genérico o reviewer ainda pega o bug. O que permanece não-testado é o comportamento sob veículos que estressem *outras* classes — esta rodada valida a família date-only/output-shape, não "o reviewer pega tudo".
