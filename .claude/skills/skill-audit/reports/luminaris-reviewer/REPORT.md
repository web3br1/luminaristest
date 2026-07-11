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

## Corrida comportamental incremental — 2026-07-11 (regras pós-baseline)
Model-in-loop fora do CI: subagente atuou COMO o revisor em contexto limpo, produziu a entrada de
relatório por case-id; assertions checadas contra o artefato. Score mantém 1.00 (corrida real). O
baseline 2026-06-25 (topo) segue a corrida de referência.

| Regra | Versão | Eval | Resultado 2026-07-11 | Evidência comportamental |
|---|---|---|---|---|
| REV-007 | v1.1.0 | `happy-3` | PASS 5/5 | detectou o toque em `routes/index.ts` num slice de Fase A via `git diff --name-only`, REPROVADO, devolveu a linha de registro à Fase B |
| REV-006 | (pós-baseline) | `happy-2` (reformulada 2026-07-11) | PASS 5/5 determinístico | rodou o gate de wiring, ancorou o veredicto no exit code real, BLOQUEOU sem forjar FAIL (REV-006 + REV-003) |

**Eval `happy-2` reformulada (2026-07-11) — de-brittle self-contained.** A versão anterior afirmava como fato
uma rota órfã (`server/src/routes/payroll.ts`) ausente da árvore → o revisor corretamente BLOQUEAVA, mas o intent
(rodar o gate + agir no exit code real, sem forjar) só passava por acidente do texto. Como um `payroll.ts` órfão
permanente quebraria o próprio `wiring`/`run --all`, criar fixture está fora; a eval foi **reformulada** para
tratar a premissa como **afirmação a verificar** (não fato): o revisor roda o gate contra a árvore, ancora no
exit code real e devolve BLOCKED (gate verde ⇒ afirmação não reproduz) OU FAIL (se o gate acusar órfão). Agora é
**determinística na árvore real** e testa fielmente REV-006 (rodar o gate) + REV-003 (evidência, não forjar).
Confirmada por corrida comportamental: PASS 5/5.
