# Skill Audit Report — backend-workflow-transition-generator

- Skill: `backend-workflow-transition-generator` (id `SKL-WORKFLOW-TRANS`, v1.0.1)
- Executed at: 2026-07-16
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 2/2 de código PASS via `batch-eval`. Os **2 casos de trigger NÃO foram re-executados** — herdados de 2026-06-25 (router-judge).
Regras: AC-2.1-B4 (não editar DynamicTableService) via eval; AC-2.1-B1 injeção no motor via G6 (grep, determinístico).

## Execução
Dialeto-piloto (governs-rules AC-* → gates G5/G6/P6/reviewer). Regras determinísticas (grep G5/G6) dispensam eval (SG-035); regras design-time cobertas por eval comportamental (geração em contexto limpo + batch-eval). Evidência: `./_eval.out.txt`.

**1ª tentativa invalidada e refeita** — o prompt de geração não proibia narração e o modelo fechava com um checklist de conformidade (`- [x] … sem prisma.* direto`), que `absent:prisma.` reprovava. Diagnóstico completo no REPORT de `backend-route-generator`.

## Correções de eval (de-brittle, com controle de negação provando que o gate ainda discrimina)

**2026-07-16 — política ratificada pelo dono: o eval crava a PROPRIEDADE, não a forma canônica.**

`regression-1` (AC-2.1-B4) media **ortografia**: o regex `(nunca|NUNCA|n[aã]o)[\s\S]{0,80}DynamicTableService` tem `n[aã]o` **minúsculo**, e reprovava a resposta certa — **"**Não** modifique `DynamicTableService.ts`"** — porque a frase começa com maiúscula. Também exigia proximidade de ≤80 caracteres, medindo distância entre palavras em vez da tese.

- Agora: `regex-i:(nunca|n[aã]o)\s+(injete|injetar|modifique|modificar|edite|editar|altere|alterar|toque|tocar)[\s\S]{0,120}DynamicTableService` — exige o **verbo de proibição** ligado ao motor, sem depender de caixa.
- A 1ª assertion (onde a integração deve viver) virou `regex-i` pelo mesmo motivo.
- Harness ganhou o kind `regex-i` (case-insensitive), obrigatório em assertion de prosa: em português a frase começa com maiúscula.

**Controle de negação:** a regressão do incidente 2026-06-24 —
```
A integração deve viver dentro do próprio motor: injete o PostingService no
DynamicTableService e chame-o no runInTransaction da transição…
Edite DynamicTableService.ts para receber o PostingService pelo construtor.
```
→ `regression-1` **0/2** (ambas as assertions reprovam). O gate discrimina.

## Skipped / blocked
- Casos de trigger: não re-executados — exigem router-judge, fora do `batch-eval`.
