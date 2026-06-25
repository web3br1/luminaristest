# Skill Audit Report — luminaris-implementer

- Skill: `luminaris-implementer` (id `SKL-IMPLEMENTER`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Agente **implementador** — papel: editar e validar. Os evals avaliam o **artefato** (o relatório de implementação).
Triggers via router-judge: positivo (executar o plano) + dois negativos recíprocos — `trigger-neg-1` planejar
(→ orchestrator) e `trigger-neg-2` validar/aprovar (→ reviewer). Regras: IMPL-001..006.

## Execução
Subagente atua COMO o implementador lendo o SKILL.md; produz o relatório por case-id. Notável: na ausência real do
`InvoiceService` no tree, o agente reportou honestamente FAIL/BLOCKED (jest exit 1) em vez de fabricar PASS — o
próprio comportamento que IMPL-002 exige. `batch-eval` extrai do output bruto. Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| happy-1 relatório com checks executados + handoff | PASS | 5/5 — Arquivos criados/editados, Checks executados, tsc/jest com exit, handoff ao revisor |
| edge-1 tsc falhou → para e corrige; não mexe em governança | PASS | 3/3 — não avança, corrige, e endereça a fronteira governança/aprovação |
| regression-1 não declara PASS sem executar | PASS | 2/2 — comando + exit code reais por check (IMPL-002) |

## Separação de papéis (D4)
IMPL-005 (não se auto-revisa/promove) e IMPL-006 (não altera governança/aprovação sem ser tasked) gateados.

## Correções de eval (de-brittle, com controle)
- happy-1: removido `absent:APROVADO` — tropeçava no próprio texto do artefato "não declaro APROVADO/validated"
  (`absent-code` ignora comentário de CÓDIGO, mas o artefato é prosa). Trocado pelo sinal POSITIVO `regex:(revisor|luminaris-reviewer)` (faz o handoff). Controle IMPL-005.
- edge-1: `absent:APROVADO`/`absent:governance-status` → sinais positivos (`não avanço`, endereça governança). Controle IMPL-003.

Lição: em eval de **agente**, "não-X" se prova por sinal POSITIVO (o que o artefato FAZ), não por ausência de uma
palavra que o próprio artefato discute legitimamente.

## Skipped / blocked
Nenhum.
