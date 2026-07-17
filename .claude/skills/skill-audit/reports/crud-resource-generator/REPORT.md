# Skill Audit Report — crud-resource-generator

- Skill: `crud-resource-generator` (id `SKL-CRUD`, v1.1.0)
- Executed at: 2026-07-16
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 3/3 de código PASS via `batch-eval` mecânico. Os **2 casos de trigger NÃO foram re-executados** nesta corrida — herdados de 2026-06-25 (router-judge), não re-verificados.
Regras cobertas: CRUD-001..006. `CRUD-006` **inverteu de significado** nesta versão (registro = 2 toques; auth é deny-by-default e não entra no registro).

## Execução
Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions); seções por case-id; verificação `skill-audit batch-eval`. Evidência: `./_eval.out.txt`.

**1ª tentativa invalidada e refeita** (prompt de geração não proibia narração — o modelo emitia o código correto mais auto-atestado, e `absent:` sobre o token reprovava o acerto). Ver o REPORT de `backend-route-generator` para o diagnóstico completo.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)

**Bug do harness, não da eval (corrigido em `skill-audit.mjs`).** `happy-1` dava 11/13 com o repository IMPECÁVEL: o escopo `@CommentRepository.ts::` usava `path.includes()`, e `'ICommentRepository.ts'.includes('CommentRepository.ts') === true` — a interface aparece antes no output, então as assertions de `findMany`/`deletedAt` validavam **a interface**, que naturalmente não os tem. Escopo agora casa fronteira de caminho (`path === scope` ou `endsWith('/'+scope)`); ambiguidade virou FAIL explícito. A/B sobre os 33 outputs gravados: zero regressão. `happy-1` → 13/13.

| Caso | Antes | Agora | Por quê |
|---|---|---|---|
| `edge-1` | pedia o registro em `middleware/auth.ts` | pede o registro em `routes/index.ts`; `+absent:protectedApiPaths` | CRUD-006 inverteu: o array não existe mais (deny-by-default) |

Histórico: CRUD-004 (2026-06-25) — `absent:` invertido (a resposta precisa nomear o motor p/ proibi-lo) → regex "nunca…motor" + controle.

## Skipped / blocked
Nenhum.
