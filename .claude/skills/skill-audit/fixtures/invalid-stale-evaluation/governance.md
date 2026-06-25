---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FIXTURE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
evaluation:
  report: ./report.md
  last_evaluated: 2026-06-01
  score: 0.95
  minimum_score: 0.90
rules:
  VMS-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança (fixture)
Mapa regra→gate.