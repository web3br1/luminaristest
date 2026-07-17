# Skill Audit Report — backend-route-generator

- Skill: `backend-route-generator` (id `SKL-BACKEND-ROUTE`, v1.1.0)
- Executed at: 2026-07-16
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 3/3 de código PASS via `batch-eval` mecânico. Os **2 casos de trigger NÃO foram re-executados** nesta corrida — herdados de 2026-06-25 (router-judge), não re-verificados.
Regras cobertas: ROUTE-001..006. `ROUTE-002` **inverteu de significado** nesta versão (deny-by-default: auth deixou de ser toque de registro) — ver `governance.md`.

## Execução
Geração em contexto limpo por subagente lendo apenas o `SKILL.md` (sem ver as assertions); seções por case-id; verificação `skill-audit batch-eval`. Evidência: `./_eval.out.txt`.

**1ª tentativa invalidada e refeita.** Deu 1/3 porque o prompt de geração não proibia narração: o modelo emitia o código correto **mais** auto-atestado (`[ROUTE-002] middleware/auth.ts NÃO é tocado`), e `absent:` sobre o token reprovava o acerto. O output de 2026-06-25 (código puro) rodado contra as assertions de hoje dá PASS — as assertions estavam íntegras; o prompt é que estava. `MODEL-TUNING.md` já registrava que Opus 4.8 narra por padrão e que o fix é default de silêncio explícito.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)

| Caso | Antes | Agora | Por quê |
|---|---|---|---|
| `happy-1` | sem guarda de ROUTE-002; `target_files` incluía `auth.ts` | `+absent:protectedApiPaths`, `+absent:middleware/auth.ts`; targets 4→3 | cobre o caminho POSITIVO — gerar a rota sem emitir o toque morto |
| `regression-1` | `contains:protectedApiPaths` + `contains:'/api/invoices'` (exigia a edição no allowlist) | `absent:'/api/invoices'` + regex positivo de deny-by-default | a regressão inverteu: o array não existe mais; o risco agora é reintroduzir o toque morto lendo ADR antigo |
| `edge-1` | `contains:@openapi`, `contains:paths:` | `regex:/api/invoices:[\s\S]{0,600}(get\|post):` | eram **moldura**: a SKILL.md ensina que o bloco vai DENTRO do `@openapi`/`paths:` já existentes em `docs.paths.ts` — exigir a moldura num fragmento reprova quem seguiu a skill. O que discrimina path × component schema é a chave de rota seguida de verbo |

**Controle de negação:** component schema (`components: schemas: Invoice: type: object`) no lugar da entrada de path → `edge-1` **0/3**. É a regressão literal de ROUTE-003 ("component schema do DTO não substitui o bloco de path").

## Skipped / blocked
- Casos de trigger (`trigger-pos-1`, `trigger-neg-1`): não re-executados — exigem router-judge, fora do `batch-eval`.
