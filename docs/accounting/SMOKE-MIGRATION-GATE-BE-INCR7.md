# SMOKE-MIGRATION-GATE-BE-INCR7 — Relatório de Execução

- **Data:** 2026-07-03
- **Executado por:** Agente implementador (PR1 do plano BE-INCR-7)
- **Migration alvo:** `20260703053351_add_bank_reconciliation`
- **Resultado:** **PASS**

## Base

| Campo | Valor |
|---|---|
| Forma da migration | **Aditiva pura** — 3 `CREATE TABLE` novas (`bank_statements`, `bank_statement_lines`, `reconciliation_matches`) + 9 índices (3 UNIQUE) + FKs (`glAccountId→accounts` RESTRICT, `statementId→bank_statements` CASCADE, `statementLineId→bank_statement_lines` CASCADE, `postingId→postings` RESTRICT) |
| ALTER/backfill em tabela existente | **Nenhum** (back-relations em `Account`/`Posting` são list-side; zero toque em tabelas legadas) |
| Método | (A) fresh-recreate: `migrate dev` aplicou as 16 migrations anteriores + a nova em DB vazio · (B) incremental N-1→N: DB com as 16 anteriores + dados legados sintéticos + aplicar só a pendente |
| Dados legados sintéticos (N-1) | 1 User, 2 Accounts, 1 JournalEntry (Posted), 2 Postings |
| Verificação funcional | `node:sqlite` contra o DB smoke; `dev.db` do projeto **não foi tocado** (worktree sem `.env`; `DATABASE_URL` apontado a scratchpad) |

## Execução — gates de migração

| Check | Resultado |
|---|---|
| (A) Fresh-recreate: 17 migrations aplicam limpo em DB vazio | PASS |
| (B) N-1: 16 migrations anteriores aplicam limpo | PASS |
| (B) `bank_*`/`reconciliation_matches` AUSENTES no estado N-1 | PASS |
| (B) `20260703053351` aplica como **exatamente 1 migration pendente** sobre N-1 | PASS |

## Validação funcional (9 checks — `node:sqlite`)

| Check | Resultado |
|---|---|
| `bank_tables_present` — 3 tabelas criadas | PASS |
| `indexes_present_>=9` — 9 índices (3 UNIQUE) presentes | PASS |
| `legacy_tables_intact` — User/accounts/journal_entries/postings intactos pós-migração (entry ainda `Posted`) | PASS |
| `statement_line_match_insert_readback` — insert statement+line+match e releitura (`status=UNMATCHED`, `matchType=AUTO`) | PASS |
| `unique_sha256_enforced` — re-import mesmo arquivo (`userId,unitId,sha256`) rejeitado por UNIQUE real | PASS |
| `unique_line_posting_enforced` — `(statementLineId,postingId)` duplicado rejeitado por UNIQUE real (ACC-013) | PASS |
| `fk_posting_restrict` — delete de posting com match é bloqueado (RESTRICT) | PASS |
| `fk_cascade_statement_delete` — delete do statement cascateia lines e matches | PASS |
| `migration_recorded_finished` — `_prisma_migrations` com `finished_at` | PASS |

## Gates de código

| Gate | Resultado |
|---|---|
| `npx prisma validate` | PASS |
| `tsc` server (`npx tsc --noEmit`) | PASS (exit 0) |
| `tsc` my-app | PASS (exit 0) |
| `jest features/accounting` | PASS (23 suites / 334 testes — baseline sem regressão) |

## Resultado final

**PASS — 0 falhas (migração 4/4 + funcional 9/9 + pré 2/2 + gates de código 4/4).**

## Observações

- Migration puramente aditiva: nenhum modo de falha de ALTER/backfill/NOT-NULL é possível; risco a dados legados = nulo (confirmado por `legacy_tables_intact`).
- `bank_statement_lines` **sem `deletedAt`** — deliberado (ADR-INCR7): linha de staging é imutável; `status=IGNORED` cobre o descarte. `reconciliation_matches` usa soft-undo próprio (`unmatchedAt`, D7/ACC-018) em vez de `deletedAt`.
- `postingId` FK com **RESTRICT** — um posting com match (mesmo desfeito) nunca some por baixo da trilha de conciliação (postings não sofrem hard-delete de qualquer forma; ACC-020).
- Antes do deploy em produção, repetir `prisma migrate deploy` sobre backup do `dev.db` real (mesmo protocolo dos increments anteriores).
