# Skill Audit Report — luminaris-orchestrator

- Skill: `luminaris-orchestrator` (id `SKL-ORCHESTRATOR`, v1.0.0)
- Executed at: 2026-06-25
- Overall score: 1.00
- Minimum: 0.90
- Overall result: PASS

Agente de **orquestração** — papel: decompor, rotear, rastrear. Os evals avaliam o **artefato** (o PLANO), não código.
Triggers via router-judge: positivo (montar o plano) + dois negativos **recíprocos de papel** — `trigger-neg-1`
implementação (→ luminaris-implementer) e `trigger-neg-2` revisão (→ luminaris-reviewer). Regras: ORCH-001..005.

## Execução
Subagente atua COMO o orquestrador lendo o próprio SKILL.md; produz o PLANO por case-id. `batch-eval` extrai cada
seção mecanicamente do output bruto (artefato single-doc — sem multi-file). Evidência verbatim: `./_eval.out.txt`.

| Check | Status | Evidência |
|---|---|---|
| happy-1 plano com STEP 0 + handoff + delegação | PASS | 7/7 — §2.1/STEP 0, roteia Prisma first-class, Passos/Ordem/Checks/Riscos, handoff ao implementer |
| edge-1 ambiguidade → pergunta | PASS | 2/2 — faz a pergunta da fronteira §2.1 antes de planejar (ORCH-005) |
| regression-1 não se auto-atribui | PASS | 2/2 — delega implementação ao implementer E revisão ao reviewer (ORCH-003) |

## Separação de papéis (D4)
ORCH-001 (só planeja, não implementa/aprova), ORCH-003 (nunca atribui implementação/revisão a si mesmo) gateados.
Controles ORCH-003 (delegação vs auto-atribuição) e ORCH-004 (handoff carrega checks) discriminam.

## Correções de eval (de-brittle, com controle)
Nenhuma de-brittle necessária — assertions positivas (presença de seção/roteamento) passaram na 1ª corrida. 2 controles.

## Skipped / blocked
Nenhum.
