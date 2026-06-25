# Skill Audit Report — dynamic-table-preset-generator

- Skill: `dynamic-table-preset-generator` (id `SKL-DT-PRESET`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos: 5/5 PASS. Regras: AC-2.1-B2/B3 (routing), AC-2.2-2 (unique≠constraint) via eval; AC-2.2-3 self-relation via G5 (grep, determinístico).

## Execução
Dialeto-piloto (governs-rules AC-* → gates G5/G6/P6/reviewer). Regras determinísticas (grep G5/G6) dispensam eval (SG-035); regras design-time cobertas por eval comportamental (geração em contexto limpo + batch-eval/router-judge). Evidência: `./_eval.out.txt`.

## Skipped / blocked
Nenhum.
