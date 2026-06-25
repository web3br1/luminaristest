# Skill Audit Report — luminaris-reviewer

- Skill: `luminaris-reviewer` (id `SKL-REVIEWER`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Agente **revisor** — papel: verificar independentemente e reportar evidência. Os evals avaliam o **artefato** (o
relatório de revisão). Triggers via router-judge: positivo (validar) + dois negativos recíprocos — `trigger-neg-1`
planejar (→ orchestrator) e `trigger-neg-2` criar arquivos (→ implementer). Regras: REV-001..005.

## Execução
Subagente atua COMO o revisor lendo o SKILL.md; produz o relatório por case-id. `batch-eval` extrai do output bruto.
Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| happy-1 §2.1 → FAIL com evidência + tsc + não-edita | PASS | 6/6 — REPROVADO, cita §2.1/PostingService, arquivo:linha, rodou tsc, sugere correção (REV-001/002/005) |
| edge-1 defeito → devolve, não conserta | PASS | 4/4 — FAIL InvoiceRepository.ts:34 + correção + devolve ao implementador (REV-004) |
| regression-1 evidência ausente → BLOCKED, nunca PASS | PASS | 3/3 — veredicto BLOCKED/REPROVADO, sem APROVADO, cita evidência ausente (REV-003) |

## Critérios D4 cobertos
- Implementer afirma PASS sem executar checks → reviewer rejeita: `regression-1` (BLOCKED).
- Evidência ausente → BLOCKED, nunca PASS: REV-003 + controles REV-003/003b.
- Reviewer acha defeito → devolve em vez de editar: `edge-1` + controle REV-004 (bom devolve / ruim "já corrigi").

## Correções de eval (de-brittle, com controle)
Nenhuma de-brittle necessária — o revisor usa `REPROVADO`/`BLOCKED` (nunca a palavra `APROVADO`), então
`absent-code:APROVADO` discrimina limpo. 3 controles (REV-003, REV-003b, REV-004).

## Skipped / blocked
Nenhum.
