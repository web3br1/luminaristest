# SMOKE-MIGRATION-GATE-BE-INCR7-DEPLOY — Relatório de Execução (dev.db real)

- **Data:** 2026-07-03
- **Executado por:** Agente (gate de deploy, master map T12)
- **Migration alvo:** `20260703053351_add_bank_reconciliation`
- **Base de dados:** cópia do `dev.db` **real** do projeto (não sintética, não fresh-recreate)
- **Resultado:** **PASS**

Este gate complementa `SMOKE-MIGRATION-GATE-BE-INCR7.md` (fresh-recreate + N-1 sintético,
já PASS). Aqui a migration roda sobre uma cópia fiel do banco de desenvolvimento vivo —
o gate que faltava antes de liberar o deploy do BE-INCR-7.

## Isolamento (regra dura: nunca tocar o dev.db real)

| Passo | Evidência |
|---|---|
| Localização do banco real | `server/.env` → `DATABASE_URL=file:./prisma/dev.db`, resolvido pelo Prisma (relativo a `prisma/schema.prisma`) para `server/prisma/prisma/dev.db` |
| Cópia | `dev.db` (667.648 bytes) + `dev.db-wal` (0 bytes, já checkpointed) + `dev.db-shm` copiados para scratchpad isolado (`.../scratchpad/smoke-incr7-deploy/`) |
| Verificação de integridade da cópia | `md5sum` idêntico entre original e cópia antes de qualquer operação (`ca004c74...`) |
| Toda a migração e os testes funcionais | rodaram **só** na cópia (`DATABASE_URL` apontado para o caminho Windows da cópia — `file:C:/Users/...`, nunca `file:/c/...`) |
| Prova de não-toque no original | `md5sum` + `Get-Item` (size/mtime) do `dev.db`/`-wal`/`-shm` reais, comparados **depois** de toda a operação: **idênticos** ao estado antes de começar (667.648 bytes, mtime `02/07/2026 09:55:02`, sem qualquer escrita) |

## Pré-estado da cópia (antes da migration) — `node:sqlite`

| Tabela | Estado |
|---|---|
| `bank_statements` / `bank_statement_lines` / `reconciliation_matches` | **AUSENTES** (esperado) |
| `User` | 2 linhas |
| `accounts` | 41 linhas |
| `journal_entries` | 15 linhas |
| `postings` | 30 linhas |
| `accounting_periods` | 36 linhas |
| `audit_events` | 92 linhas |
| `_prisma_migrations` (finished_at not null) | 16 |

## Execução — `prisma migrate deploy`

| Check | Resultado |
|---|---|
| `prisma migrate deploy` aplica **exatamente 1 migration pendente** (`20260703053351_add_bank_reconciliation`) sobre a cópia do dev.db real | PASS |
| `npx prisma validate` (schema) | PASS |

## Pós-estado da cópia — `node:sqlite` (leitura, cópia intocada por mutação)

| Check | Resultado |
|---|---|
| 3 tabelas novas presentes (`bank_statements`, `bank_statement_lines`, `reconciliation_matches`) | PASS |
| 9 índices nas tabelas novas, 3 UNIQUE | PASS (`bank_statements_userId_unitId_sha256_key`, `bank_statement_lines_statementId_lineNumber_key`, `reconciliation_matches_statementLineId_postingId_key`) |
| Tabelas legadas com as **mesmas contagens** do pré-estado (nenhuma linha perdida) — `User`=2, `accounts`=41, `journal_entries`=15, `postings`=30, `accounting_periods`=36, `audit_events`=92 | PASS |
| `_prisma_migrations` — nova migration registrada com `finished_at` não-nulo; total 17 (16+1) | PASS |

## Validação funcional — testes de constraint real (numa segunda cópia disponível, "mutate", derivada da já migrada — para não contaminar a contagem legada acima)

| Check | Resultado |
|---|---|
| FK RESTRICT bloqueia delete de `postings` referenciado por `reconciliation_matches.postingId` | PASS (`FOREIGN KEY constraint failed`) |
| `@@unique(userId,unitId,sha256)` em `bank_statements` rejeita duplicata real | PASS (`UNIQUE constraint failed`) |
| `@@unique(statementLineId,postingId)` em `reconciliation_matches` rejeita duplicata real | PASS (`UNIQUE constraint failed`) |
| FK CASCADE: delete de `bank_statements` remove `bank_statement_lines` e (transitivamente) `reconciliation_matches` | PASS (0 linhas remanescentes em ambas) |

## Gates de código (worktree `keen-goodall-085295`, mesmo commit da migration)

| Gate | Resultado |
|---|---|
| `npm install` + `npx prisma generate` (worktree sem `node_modules` compartilhado) | OK |
| `npx tsc --noEmit` (server) | PASS (exit 0, sem erros) |
| `npx jest --no-coverage features/accounting` | PASS (27 suites / 408 testes) |

## Resultado final

**PASS — 0 falhas** (isolamento 1/1 + pré-estado conferido + migração 1/1 pendente aplicada
limpa + pós-estado 4/4 + funcional/constraint 4/4 + gates de código 2/2).

O `dev.db` real permanece **intocado**: prova por `md5sum` idêntico e `LastWriteTime`
inalterado do arquivo original, `-wal` e `-shm`, comparados antes e depois de toda a operação.

## Veredicto

**BE-INCR-7 (conciliação bancária) está deploy-cleared** quanto ao risco de migração sobre
dados vivos. Combinado com `SMOKE-MIGRATION-GATE-BE-INCR7.md` (fresh-recreate + N-1 sintético,
PASS), a migration `20260703053351_add_bank_reconciliation` foi validada nos três modos
exigidos pelo protocolo do projeto: fresh, incremental sintético e incremental sobre banco real.

Pendências que **não** bloqueiam este gate (fora de escopo): FE de conciliação (deferido) e
sign-off humano em browser — já registrados em `[accounting-next-increment-reconciliation]`.
