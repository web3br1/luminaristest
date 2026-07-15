# Smoke-migration-gate — INCR-AR (Contas a Receber) · DEPLOY-CLEARED

**Data:** 2026-07-15 · **Migração:** `20260715030000_add_receivables` (aditiva: 2 `CREATE TABLE` +
4 índices, zero `ALTER`/`DROP`). **Gate:** T12 — "aditiva não dispensa o gate" sobre base populada
por dados escritos pelo app (memória `sintetico-nao-cobre-formato-de-dado-real`).

## Procedimento

Cópia fiel do dev.db real populado (`server/prisma/prisma/dev.db` — o caminho-chamariz que o runtime
usa, memória do decoy-path; 796 KB, md5 `4381e1da…`) para o scratchpad; `prisma migrate deploy` do
branch `claude/ar-impl` sobre a cópia; verificação; confirmação de que o real ficou intocado.

## Resultado — PASS

| Checagem | Resultado |
|---|---|
| `migrate deploy` na cópia | **PASS** — 3 pendentes aplicadas limpo (`add_accounts_payable`, `approval_tower_maker_checker`, `add_receivables`); "All migrations successfully applied", exit 0 |
| `PRAGMA integrity_check` | **ok** |
| `PRAGMA foreign_key_check` | **0 violações** |
| `journal_entries` preservados | **15 → 15** (inalterado) |
| `postings` / `audit_events` | **30 / 92** (inalterados — hash-chain intacto) |
| `receivables` (tabela nova) | **0 linhas** (aditiva, vazia) |
| `receivable_receipts` (tabela nova) | **0 linhas** |
| dev.db REAL intocado | **md5 `4381e1da…` idêntico antes/depois** |

**Nota:** a cópia estava 3 migrações atrás do branch (predava AP + torre de aprovação + AR); as três
aplicaram em sequência sem erro sobre os 15 lançamentos reais (formato Prisma INTEGER ms-epoch). As
contas de controle novas (`1.1.5 Clientes a Receber`) NÃO são semeadas pela migração — o
`ensureChartOfAccounts` as cria idempotentemente por código no 1º uso do app (zero migração, precedente
`2.1.2` do AP). Bancos existentes são inertes à adição das tabelas.

## Veredito

**DEPLOY-CLEARED.** A migração AR é segura sobre dados reais; nenhuma perda, nenhuma violação de FK,
real db comprovadamente intocado. Residual: sign-off humano no browser (FE `FE-INCR-AR`, diferido).
