# Skill Audit Report — job-generator

- Skill: `job-generator` (id `SKL-JOB`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS. Triggers via router-judge: positivo (seed de volume) + dois negativos recíprocos/decoy —
`trigger-neg-1` recíproco de `interview-setup-generator` (estender o wizard de onboarding ≠ job/seed) e
`trigger-neg-2` decoy lexical de "job" (vaga/recrutamento não é esta skill). Happy/edge/regression via
`batch-eval` (file-scoped). Regras: JOB-001..008. Domínio: `server/scripts/seed-*-demo.js` + `server/src/jobs/`.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + `seed-crm-demo.js`/`PurgeDeletedRecords.ts`); seções por
case-id (`===<id>===`), arquivos por marcador `// path`. `batch-eval` extrai cada seção mecanicamente do output
bruto — sem trim manual. Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | `seed-crm-demo.js`, `PurgeDeletedRecords.ts`, `lib/logger.ts` existem no path |
| happy-1 seed de volume idempotente | PASS | 7/7 (guard prod, `__demo`+clearDemo, internalName, createMany, bypass doc) |
| happy-2 background job | PASS | 6/6 (export async Promise<void>, prisma direto, logger start/end+error, sem getFactory) |
| edge-1 clearDemo boundary | PASS | 4/4 (findMany→filter `__demo===true`→deleteMany) |
| regression-1 resolve por internalName + guard prod | PASS | 3/3 |

## Correções de eval (de-brittle, com controle)
- happy-2 `absent:getFactory(`→`absent-code:getFactory(` (tropeçava no comentário "jobs do NOT go through getFactory()"). Controle JOB-005.
- regression-1 `absent:[0]`→`absent-code:[0]` (tropeçava no comentário "never by array position [0]"). Controle JOB-007.

Novo kind de assertion `absent-code` (ignora comentários) adicionado ao `skill-audit.mjs` — limite arquitetural por
arquivo sem falso-positivo de comentário. 2 controles discriminam (bom passa / ruim falha).

## Skipped / blocked
Nenhum.
