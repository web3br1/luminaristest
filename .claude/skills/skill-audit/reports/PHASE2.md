# Skill Audit Report — Fase 2 (auditor + self-check)

- Auditor: `.claude/skills/skill-audit/skill-audit.mjs`
- Executado em: 2026-06-25
- Resultado geral: **PASS** (self-check) · gaps de migração esperados em `validate`/`governance-check`

## O que a Fase 2 entregou

| Componente | Estado | Evidência |
|---|---|---|
| CLI `skill-audit.mjs` (8 comandos) | ✅ | `node skill-audit.mjs run` executa ponta-a-ponta |
| mini-parser YAML (2 dialetos governance) | ✅ | pilotos `AC-*` parseados sem erro |
| `self-check` (7 fixtures) | ✅ PASS | exit 0; cada código detectado |
| `coverage` | ✅ | `governance/coverage-auto.md`, 6/6 gates com target válido |
| `sync-metadata` | ✅ sem findings | status/eval-score consistentes nos pilotos |
| 18 códigos de falha | ✅ implementados | ver `MIGRATION.md` |

## Self-check (auditar o auditor)

| Fixture | Esperado | Resultado |
|---|---|---|
| valid-minimal-skill | passa limpo | ✅ |
| invalid-name-mismatch | NAME_DIRECTORY_MISMATCH | ✅ |
| invalid-rule-without-gate | RULE_WITHOUT_GATE | ✅ |
| invalid-orphan-gate | GATE_WITHOUT_RULE | ✅ |
| invalid-broken-reference | BROKEN_REFERENCE | ✅ |
| invalid-stale-evaluation | STALE_EVALUATION | ✅ |
| invalid-unsafe-auto-invocation | UNSAFE_AUTO_INVOCATION | ✅ |

## Estado pré-Fase-3 (gaps esperados, não regressões)

- `validate`: 96 `INVALID_FRONTMATTER` = 32 skills × {sem stable-id, sem status, sem version}.
- `governance-check`: 6 `RULE_WITHOUT_EVAL_COVERAGE` (pilotos sem `evals.json` p/ regras design-time).
- Regras de gate **determinístico** (grep G5/G6) corretamente **não** exigem eval (SG-035).

## Decisões aplicadas no auditor

1. Gate determinístico (`command`/`static`/`smoke`) dispensa eval redundante (SG-035).
2. Protocolo `P1–P6` reconhecido como gate documentado (além de `G1–G6`).
3. Adoção incremental: skill sem `governance.md` não falha `governance-check`.
4. Behavioral eval = BLOCKED no CLI (precisa de harness model-in-loop) — nunca PASS sem evidência (SG-032/039).

## Checks executados (exit codes)

| Comando | exit |
|---|---|
| `self-check` | 0 (PASS) |
| `coverage` | 0 |
| `sync-metadata` | 0 |
| `governance-check` | 1 (gaps de eval dos pilotos — esperado) |
| `validate` | 1 (32 skills não-migradas — esperado) |
