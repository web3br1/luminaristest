# Skill Audit Report — interview-setup-generator

- Skill: `interview-setup-generator` (id `SKL-INTERVIEW-SETUP`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS. Triggers via router-judge: positivo (novo estágio do wizard) + dois negativos —
`trigger-neg-1` recíproco de `job-generator` (background job/seed ≠ wizard) e `trigger-neg-2` decoy
lexical de "entrevista/vaga" (entrevista de emprego/recrutamento não é o wizard de onboarding e não redefine o
domínio de job-generator). Happy/edge/regression via `batch-eval` (file-scoped). Regras: INTV-001..007.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + `InterviewService.ts`/`PromptConfig.ts`/`InterviewTypes.ts`);
seções por case-id, arquivos por marcador `// path`. `batch-eval` extrai cada seção mecanicamente do output bruto.
Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| P1 golden refs vivos | PASS | os dois lados do slice (3 serviços backend + UI/hook) existem no path |
| P3 shape = canônico atual | PASS (após patch) | ver "Patch P3" abaixo |
| happy-1 novo estágio COLLECTING_INDUSTRY | PASS | 9/9 (enum InterviewStage+ProcessableStage, `stageConfig`/`IStageConfig`, marcador, `getAiResponseWithHistory(config.systemPrompt, messages)`) |
| happy-2 field customization | PASS | 5/5 (Zod `z.enum` + `reorder`, FieldPresetMatcher, StateManager Map por sessionId) |
| edge-1 loop sem marcador | PASS | 3/3 (sem `INDUSTRY_CONFIRMED` → permanece no estágio) |
| regression-1 singleton + boundary | PASS | 3/3 (`getInstance()`, `private static instance`, sem React) |

## Patch P3 aplicado (shape drift na própria skill)
A SKILL.md ensinava `STAGE_PROMPTS: Record<ProcessableStage, string>` e `StageHandlers.getAiResponseWithHistory(messages, prompt)`
(estático, args trocados). O canônico vivo é `stageConfig: Record<ProcessableStage, IStageConfig>`
(`{ systemPrompt, completionCheckPrompt, nextStage }`) e `this.stageHandlers.getAiResponseWithHistory(systemPrompt, messages)`.
Generation contract §2/§3 reescrito para o shape real (senão a skill ensinaria drift e o eval validaria código errado).

## Correções de eval (de-brittle, com controle)
- happy-1 `regex:case 'COLLECTING_INDUSTRY'`→`regex:(case|stage ===) 'COLLECTING_INDUSTRY'` (o canônico usa `else if (stage === ...)`, não switch). Controle INTV-004.
- happy-1 `absent:STAGE_PROMPTS`→`absent-code:STAGE_PROMPTS` (drift guard, comment-insensitive). Controle INTV-003.
- regression-1 `absent:new InterviewService(`→`regex:private static instance` (a asserção antiga falhava no PRÓPRIO singleton, cujo `getInstance()` faz `new` legitimamente). Controle INTV-001.
- regression-1 `absent:from 'react'`→`absent-code:from 'react'`. Controle INTV-007.

4 controles discriminam.

## Skipped / blocked
Nenhum.
