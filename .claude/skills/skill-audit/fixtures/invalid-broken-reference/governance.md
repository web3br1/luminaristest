---
schema_version: 1
type: skill-governance
governance-skill-id: SKL-FIXTURE
skill_path: ./SKILL.md
status: validated
owner: engineering
criticality: normal
rules:
  VMS-001:
    gates:
      - type: eval
        target: ./evals/evals.json#happy-1
---

# Governança (fixture)
Mapa regra→gate.