# Skill Audit Report — structured-data-generator

- Skill: `structured-data-generator` (id `SKL-STRUCTURED-DATA`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Casos PASS (triggers via router-judge incl. neighbor-neg; happy/edge/regression via batch-eval, file-scoped). Regras: SDATA-001..007. Domínio backend (.ts) — sem acoplamento acidental a React/Express/Prisma/transport.

## Execução
Geração em contexto limpo (subagente lê SKILL.md + suas evals); seções por case-id; `batch-eval` AST (ast-import) + text; controles de negação. Evidência: `./_eval.out.txt`.

## Correções de eval (de-brittle, com controle)
absent:undefined→absent:return undefined (guard converte p/ null); regex de tipo (string|number|null)[][] com parênteses literais. 2 controles. Neighbor-neg → document-processing.

## Skipped / blocked
Nenhum.
