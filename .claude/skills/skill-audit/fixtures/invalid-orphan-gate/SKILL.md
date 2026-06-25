---
name: invalid-orphan-gate
description: Fixture de referência que passa em todos os gates. Use no self-check; não gera nada em runtime.
compatibility: Claude Code; fixture offline do self-check.
disable-model-invocation: true
metadata:
  governance-skill-id: "SKL-FIXTURE"
  governance-version: "1.0.0"
  governance-status: "validated"
  governance-owner: "engineering"
  governance-last-evaluated: "2026-06-25"
  governance-eval-score: "0.95"
---

# invalid-orphan-gate

## Objetivo
Fixture do self-check do skill-audit.

## Contrato normativo
### [VMS-001] Regra normativa VMS-001
Coberta por gate e eval.


## Validação
Rodar `skill-audit self-check`.
