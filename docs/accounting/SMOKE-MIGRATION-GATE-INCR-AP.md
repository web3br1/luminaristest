# SMOKE-MIGRATION-GATE-INCR-AP — Relatório de Execução (dev.db real, migração aditiva AP)

- **Data:** 2026-07-14
- **Executado por:** Agente (Task 5 — Contas a Pagar operacional, Fase 0/A/B)
- **Migration alvo:** `20260714132654_add_accounts_payable` (INCR-AP) — 2× `CREATE TABLE` (`payables`, `payable_payments`) + 4 índices; **zero ALTER** em tabela existente.
- **Base de dados:** cópia isolada do `dev.db` **real** (815.104 bytes, md5 `4381e1daebbd6f8ad98efdbb7caa21fd`) — o mesmo banco vivo known-good dos gates INCR-1..7.
- **Resultado:** **PASS.** A migração aplica limpa sobre o banco populado; integridade e FK íntegras; tabelas novas criadas e vazias; **dado existente inalterado**; original **não tocado**.

> "Aditiva não dispensa o gate" (ADR-INCR-AP §4). Ainda que a migração seja só `CREATE TABLE`
> (nenhum table-rebuild/backfill como a classe que quebrou o INCR-3), o gate roda sobre **dados
> reais escritos pelo Prisma** — não sobre banco sintético. Aqui não há caminho de dados a
> corromper (nenhuma linha existente é lida/reescrita), o que é ele próprio a evidência de PASS.

## Isolamento (regra dura: nunca tocar o dev.db real)

| Passo | Evidência |
|---|---|
| Localização do banco real | `DATABASE_URL=file:./prisma/dev.db` → resolvido pelo Prisma (relativo a `prisma/schema.prisma`) para `server/prisma/prisma/dev.db` |
| Cópia | `dev.db` (815.104 bytes; sem `-wal`/`-shm` pendentes) copiado para scratchpad isolado (`.../scratchpad/smoke-ap/`) |
| Verificação da cópia | `md5sum` **idêntico** entre original e cópia (`4381e1daebbd6f8ad98efdbb7caa21fd`) |
| Toda migração/validação | rodou **só** na cópia (`DATABASE_URL=file:C:/...` Windows-style, nunca o original) |
| Prova de não-toque no original | `md5sum` (`4381e1da...`) + size (815.104) + mtime (`2026-07-14 01:13`) **idênticos** antes e depois de toda a operação |

## Execução (sobre a cópia)

| Check | Resultado |
|---|---|
| `prisma migrate status` na cópia (pré) | **1 pendente** — exatamente `20260714132654_add_accounts_payable` (as 20 da `main` já aplicadas) |
| `prisma migrate deploy` na cópia | **PASS** — a migração AP aplicou limpa; "All migrations have been successfully applied" (21/21 finalizadas) |
| `PRAGMA integrity_check` | **PASS** (`ok`) |
| `PRAGMA foreign_key_check` | **PASS** (0 violações) |
| Tabelas novas presentes | **PASS** — `payables`, `payable_payments` criadas |
| Estado inicial das tabelas novas | `payables`=0, `payable_payments`=0 (aditiva, sem seed de dados) |
| **Dado existente inalterado** | **PASS** — `accounts`=41, `journal_entries`=15, `audit_events`=92 (idênticos ao baseline known-good do gate INCR-1/INCR-2) |
| **Chart of accounts `2.1.2`** | folha nova é seed idempotente por `code` em `ensureChartOfAccounts` (não é migração de dados) — nasce no 1º `postEntry` do escopo, **não** consome linha de migração; verificado por leitura (`ChartOfAccountsFixture.ts`) + testes de unidade. |

## FK novas (aditivas, RESTRICT/CASCADE — verificadas)

- `payables.userId → User(id)` **ON DELETE CASCADE** (a trilha imutável é o `AuditEvent`, exceção ao cascade — T8).
- `payables.expenseAccountId → accounts(id)` **ON DELETE RESTRICT** (uma conta-despesa com payable não pode ser apagada — consistente com o guard existente "conta com lançamentos não deleta").
- `payable_payments.payableId → payables(id)` **ON DELETE CASCADE**.
- `foreign_key_check` = 0 confirma que nenhuma FK nova fere linha existente (não há payable no banco vivo ainda).

## Cobertura de aplicação-limpa em banco fresh (fora deste gate, já provado)

A suíte de integração já roda `prisma migrate deploy` (incl. a migração AP) sobre bancos temporários
fresh e exercita as tabelas AP contra SQLite real:
`PayableClaim.integration.test.ts` (10 claims concorrentes → 1 vence; rename-on-delete libera a
`@@unique` sem P2002) + as demais integrações accounting — **1010/1010** testes verdes na suíte
completa do server. Este gate acrescenta o que faltava: a mesma migração sobre o **dado real populado**.

## Veredicto

| Item | Veredicto |
|---|---|
| Migração `20260714132654_add_accounts_payable` sobre dev.db real (cópia) | **PASS** — aplica limpa, aditiva, integridade/FK verdes, dado existente intacto. |
| Não-toque no dev.db original | **PROVADO** — md5/size/mtime idênticos antes e depois. |
| Deploy-readiness da migração AP | **DEPLOY-CLEARED** para a migração. |

## Residual honesto

- **Sign-off humano no browser (FE)** permanece pendente — `FE-INCR-AP` é diferido; não há tela AP ainda.
- O gate é sobre a **migração**; a correção **funcional** do fluxo AP (fato gerador duplo, TOCTOU,
  reconcile, estorno) é coberta pelos 1010 testes + integrações SQLite reais, não por este gate.
- Caso adversarial tentado: a migração ser table-rebuild disfarçada (classe INCR-3) — refutado por
  leitura do `migration.sql` (só `CREATE TABLE`/`CREATE INDEX`, nenhum `_new`/`INSERT ... SELECT`),
  e o `integrity_check=ok` + contagens inalteradas confirmam que nenhuma linha existente foi tocada.
