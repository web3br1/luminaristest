# Skill Audit Report — fullstack-feature-generator

- Skill: `fullstack-feature-generator` (id `SKL-FULLSTACK-FEATURE`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Skill de **composição** (vertical slice ponta-a-ponta) — auditada como tal, NÃO re-testando os contratos-filhos.
Triggers via router-judge: positivo (domínio novo do zero) + dois negativos que rejeitam **camada isolada** —
`trigger-neg-1` backend-only (Service+Repository → backend-service/repository) e `trigger-neg-2` UI-only (página
sobre backend existente → frontend-page/table-screen). Regras: FULL-001..008.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + o slice canônico `users`); um trecho representativo por elo,
marcador `// path` por arquivo; `batch-eval` file-scoped (toda assertion multi-arquivo é escopada). Evidência
verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | slice `users` (DTO/Service/Controller/Route/auth/frontend service) existe no path |
| happy-1 compõe a cadeia (8 arquivos) | PASS | 18/18 — DTO+@openapi, service policy-first sem prisma/React/transport, controller getFactory/safeParse/handleApiError, rota 3-toque, frontend apiClient, page withAuth+GenericTable sem prisma |
| happy-2 testes dos dois lados | PASS | 3/3 — jest service (ForbiddenError/NotFound cross-tenant) + teste de contrato frontend (envelope+amountCents) |
| edge-1 fronteiras | PASS | 6/6 — service sem prisma/React/res.json; page sem prisma/@/lib/prisma, via apiClient |
| regression-1 contrato compatível | PASS | 6/6 — backend `res.json({ data, pagination })` + `amountCents` ≡ frontend `{ data; pagination }` + `amountCents` |
| FULL-008 invocação só explícita | PASS (static) | `disable-model-invocation: true` no frontmatter (`--com-prisma` ⇒ `prisma migrate`, efeito externo) |

## Regressão-chave (FULL-006)
`regression-1` materializa o cenário que o usuário pediu: backend e frontend **cada um válido isolado** mas em
desacordo de contrato (envelope `{ items; total }` vs `{ data; pagination }`, ou campo `amount` vs `amountCents`)
quebra em runtime sem o `tsc` pegar. O gate exige o MESMO envelope + MESMO nome de campo nos dois lados;
os controles FULL-006a/006b provam que o par divergente FALHA.

## Correções de eval (de-brittle, com controle)
- regression-1 `regex:res.json({…data:`→`…\bdata\b` (o canônico usa shorthand de objeto `{ data, pagination }`, sem `:`). Controle FULL-006a.
- Controles adicionais FULL-006b (campo casado nos dois lados), FULL-003 (UI sem prisma), FULL-004 (service sem `res.json`).

## Skipped / blocked
Nenhum. FULL-008 é gate **static** (determinístico) — dispensa eval comportamental (SG-035).
