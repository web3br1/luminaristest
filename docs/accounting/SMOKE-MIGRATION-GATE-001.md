# SMOKE-MIGRATION-GATE-001 — Relatório de Execução

- **Data:** 2026-06-27
- **Executado por:** Agente (implementador INCR-1/INCR-2)
- **Resultado:** PASS

## Base

| Campo | Valor |
|---|---|
| Origem | Sintético — 11 migrations pré-INCR-1 concatenadas + dados legados inseridos via SQL |
| Schema inicial | Migrations 1–11 (até `20260626000000_add_prepaid_package_balance`) |
| Dados mínimos | 1 User, 2 Accounts, 1 JournalEntry (Posted), 2 Postings |
| Colunas ausentes | `journal_entries.createdById`, `journal_entries.postedById`, `postings.updatedAt` (adicionadas pelo INCR-1 como nullable) |

## Execução

| Check | Resultado |
|---|---|
| Bootstrap pré-INCR-1 aplicado | PASS |
| `accounting_periods` ausente antes da migração | PASS |
| `audit_events` ausente antes da migração | PASS |
| `20260627132450_add_accounting_periods` (INCR-1) aplicada | PASS |
| `20260627140124_add_audit_events` (INCR-2) aplicada | PASS |
| `tsc server` | PASS (zero erros) |
| `tsc my-app` | PASS (zero erros) |
| `jest --no-coverage accounting` | PASS (301/301) |

## Validação funcional (7 checks)

| Check | Resultado |
|---|---|
| `legacy_data_readable` — JournalEntry + 2 Postings legíveis | PASS |
| `legacy_accounts_readable` — 2 Accounts pré-INCR-1 intactos | PASS |
| `incr1_createdById_column` — coluna adicionada (legacy row = null) | PASS |
| `incr1_postings_updatedAt_column` — coluna adicionada (legacy row = null) | PASS |
| `period_created_open` — `accounting_periods` funcional | PASS |
| `audit_event_inserted` — `audit_events` funcional, seq=1n | PASS |
| `audit_chain_head_created` — `audit_chain_heads` funcional, version=1 | PASS |

## Resultado final

**PASS — 0 falhas em todos os checks (PASS=10+7, FAIL=0)**

## Observações

- Banco smoke criado do zero com schema pré-INCR-1 real (checksums reais do `dev.db` via `prisma queryRaw`)
- `prisma migrate deploy` aplicou exatamente as 2 migrations pendentes; nenhuma migration pré-INCR-1 foi re-aplicada
- Dados legados intactos após migração; colunas nullable adicionadas sem quebra de linhas existentes
- Paths Windows necessários para `prisma db execute --url` no ambiente de desenvolvimento (file:C:/... não file:/c/...)

## Commits validados

| Commit | Increment |
|---|---|
| `ea562e0` | INCR-1 — Accounting Periods + posting gate |
| `306f790` | INCR-2 — AuditEvent append-only hash-chain |
